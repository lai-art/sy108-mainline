/* SPDX-License-Identifier: GPL-2.0-only
 * On-device download runner behind the LuCI "测速" and "流量消耗" tabs.
 * Design and rationale: docs/plans/测速功能方案.md (v3) §4.
 *
 * Rules this file must keep:
 *  - one job slot for both modes; a second start answers {accepted:false,
 *    busy:true} exactly like the cellular broker at service.c:123-129;
 *  - the byte counter is /sys/class/net/wwan0/statistics/rx_bytes sampled every
 *    500 ms, never curl's %{speed_download} (that misses retransmissions);
 *  - mode=speed stops by itself, discards the first 3 s, reports the P90 of the
 *    stable window; mode=burn reports the accumulated total and no P90 at all;
 *  - traffic cap, duration cap and a 70 °C ceiling are always armed;
 *  - curl only ever fetches http/https from a host that does not resolve into
 *    loopback, RFC 1918, link-local, CGNAT or ULA space.
 */
#define _GNU_SOURCE
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <glob.h>
#include <math.h>
#include <netdb.h>
#include <poll.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <syslog.h>
#include <time.h>
#include <uci.h>
#include <unistd.h>

#include <json-c/json.h>
#include <libubox/blobmsg.h>
#include <libubox/blobmsg_json.h>
#include <libubox/uloop.h>
#include <libubus.h>

#define MAX_THREADS 8
#define MAX_NODES 16
#define SAMPLE_MS 500
#define SERIES_MAX 1801 /* one point per second for the 1800 s hard maximum */
#define SERIES_REPLY 120
#define DISCARD_SECONDS 3

/* Speed test budget: 20 s / 300 MB, whichever comes first. 300 MB over 20 s is
 * 120 Mbps, so below that the time cap binds and the P90 window is long; above
 * it the byte cap binds and the run simply ends early, which is still a valid
 * measurement because close_bucket() divides by the real span. The byte cap is
 * not lower than this: 150 MB at 500 Mbps ends the run at 2.4 s, inside the 3 s
 * slow-start discard, leaving *zero* samples to take a P90 of. 300 MB is also
 * the hard maximum a caller may ask for. */
#define SPEED_SECONDS_DEFAULT 20
#define SPEED_SECONDS_MAX 30
#define SPEED_BYTES_DEFAULT 300000000ull
#define SPEED_BYTES_MIN 10000000ull
#define SPEED_BYTES_MAX 300000000ull

#define BURN_SECONDS_DEFAULT 300
#define BURN_SECONDS_MIN 30
#define BURN_SECONDS_MAX 1800
#define BURN_BYTES_DEFAULT 1000000000ull
#define BURN_BYTES_MIN 100000000ull
#define BURN_BYTES_MAX 10000000000ull

#define TEMPERATURE_LIMIT_DEFAULT 70.0
#define CONNECT_SECONDS 10
#define REQUEST_SECONDS 30
#define PING_TIMEOUT_MS 1800
#define RTT_TIMEOUT_MS 4500
#define RTT_BUDGET_MS 8000
#define RTT_SECONDS 300
#define COUNTER_MISS_LIMIT 6 /* 3 s of unreadable counters = interface gone */
#define FAST_EXIT_LIMIT 20

struct settings {
	char interface[24];
	char latency_target[64];
	char curl[64];
	char ping[64];
	double temperature_limit;
	unsigned threads;
	unsigned speed_seconds;
	uint64_t speed_bytes;
	unsigned burn_seconds;
	uint64_t burn_bytes;
};

struct node {
	char id[48];
	char name[96];
	char group[24];
	char group_label[48];
	char url[1024];
	char note[192];
	bool enabled;
	int rtt_ms; /* -1 when never measured */
	long long rtt_at;
};

struct job {
	bool active;
	bool speed;
	char node[48];
	char node_name[96];
	char url[1200];
	unsigned threads;
	unsigned max_seconds;
	uint64_t max_bytes;
	unsigned limit_kbps;
	double started;
	double ended;
	double child_started[MAX_THREADS];
	pid_t children[MAX_THREADS];
	uint64_t last_rx;
	uint64_t total;
	uint64_t bucket_bytes;
	double bucket_started;
	double last_sample_at;
	double speed_now;
	double series[SERIES_MAX];
	unsigned series_len;
	double latency;      /* last loaded latency in ms, NAN when unknown */
	double idle_latency; /* measured once before the load started */
	double temperature;
	unsigned long long fast_exits;
	unsigned read_errors;
	/* Terminal state, one of:
	 *   user          the caller asked to stop (or the service is going down)
	 *   byte_limit    hit max_bytes
	 *   time_limit    hit max_seconds
	 *   thermal       hottest thermal zone passed settings.temperature_limit
	 *   sim_removed   the wwan0 counters vanished: card pulled or link dropped,
	 *                 the exact cause is in "error"
	 *   error         the node delivered nothing, or curl could not start
	 * The UI must distinguish "you stopped it" from "a protection fired". */
	char stop_reason[32];
	char error[192];
};

static struct settings settings;
static struct job job;
static struct ubus_auto_conn bus;
static struct ubus_object object;
static struct uloop_timeout tick;
static struct uloop_signal term_signal;
static struct uloop_signal int_signal;

/* --------------------------------------------------------------------------
 * Small helpers
 */
static double now_mono(void)
{
	struct timespec ts;
	clock_gettime(CLOCK_MONOTONIC, &ts);
	return (double)ts.tv_sec + (double)ts.tv_nsec / 1e9;
}

static void js_string(struct json_object *o, const char *key, const char *value)
{
	json_object_object_add(o, key, value ? json_object_new_string(value) : NULL);
}

static void js_int(struct json_object *o, const char *key, int64_t value)
{
	json_object_object_add(o, key, json_object_new_int64(value));
}

static void js_bool(struct json_object *o, const char *key, bool value)
{
	json_object_object_add(o, key, json_object_new_boolean(value));
}

static void js_real(struct json_object *o, const char *key, double value)
{
	json_object_object_add(o, key, isfinite(value) ? json_object_new_double(value) : NULL);
}

static bool read_text(const char *path, char *out, size_t size)
{
	int fd = open(path, O_RDONLY | O_CLOEXEC);
	if (fd < 0)
		return false;
	ssize_t n = read(fd, out, size - 1);
	close(fd);
	if (n < 0)
		return false;
	out[n] = 0;
	char *end = out + n;
	while (end > out && (end[-1] == '\n' || end[-1] == '\r' || end[-1] == ' '))
		*--end = 0;
	return true;
}

static bool read_counter(uint64_t *value)
{
	char path[160], text[64];
	snprintf(path, sizeof(path), "/sys/class/net/%s/statistics/rx_bytes", settings.interface);
	if (!read_text(path, text, sizeof(text)) || !*text)
		return false;
	errno = 0;
	char *end = NULL;
	unsigned long long parsed = strtoull(text, &end, 10);
	if (errno || !end || *end)
		return false;
	*value = parsed;
	return true;
}

/* Hottest thermal zone, straight from sysfs. The overview reads the same
 * files through udx.status, but a protection loop must not depend on another
 * daemon being healthy. */
static double max_temperature(void)
{
	glob_t paths;
	double hottest = NAN;
	if (glob("/sys/class/thermal/thermal_zone*/temp", 0, NULL, &paths))
		return NAN;
	for (size_t i = 0; i < paths.gl_pathc; i++) {
		char text[32];
		if (!read_text(paths.gl_pathv[i], text, sizeof(text)))
			continue;
		errno = 0;
		char *end = NULL;
		double value = strtod(text, &end) / 1000.0;
		if (errno || !end || *end || !isfinite(value) || value <= 0)
			continue;
		if (!isfinite(hottest) || value > hottest)
			hottest = value;
	}
	globfree(&paths);
	return hottest;
}

/* --------------------------------------------------------------------------
 * Child processes
 */
static pid_t spawn(const char *const argv[])
{
	pid_t pid = fork();
	if (pid < 0)
		return -1;
	if (!pid) {
		setpgid(0, 0);
		/* The kernel kills the child with us: a crashed daemon must never
		 * leave a download running. */
		prctl(PR_SET_PDEATHSIG, SIGKILL);
		int null = open("/dev/null", O_RDWR);
		if (null >= 0) {
			dup2(null, STDIN_FILENO);
			dup2(null, STDOUT_FILENO);
			dup2(null, STDERR_FILENO);
			if (null > STDERR_FILENO)
				close(null);
		}
		execv(argv[0], (char *const *)argv);
		_exit(127);
	}
	setpgid(pid, pid);
	return pid;
}

/* Blocking run used for the 1 Hz latency probe and the RTT survey. Both are
 * short and bounded; the sampling loop tolerates the pause because every rate
 * is computed from the real interval length. */
static int run_sync(const char *const argv[], unsigned timeout_ms, char *out, size_t size)
{
	if (size < 2)
		return -1;
	out[0] = 0;
	int fds[2];
	if (pipe2(fds, O_CLOEXEC) < 0)
		return -1;
	pid_t pid = fork();
	if (pid < 0) {
		close(fds[0]);
		close(fds[1]);
		return -1;
	}
	if (!pid) {
		prctl(PR_SET_PDEATHSIG, SIGKILL);
		int null = open("/dev/null", O_RDWR);
		if (null >= 0) {
			dup2(null, STDIN_FILENO);
			dup2(null, STDERR_FILENO);
			if (null > STDERR_FILENO)
				close(null);
		}
		dup2(fds[1], STDOUT_FILENO);
		close(fds[0]);
		close(fds[1]);
		execv(argv[0], (char *const *)argv);
		_exit(127);
	}
	close(fds[1]);
	size_t used = 0;
	double deadline = now_mono() + timeout_ms / 1000.0;
	for (;;) {
		struct pollfd pfd = {.fd = fds[0], .events = POLLIN};
		int wait = (int)((deadline - now_mono()) * 1000.0);
		if (wait < 0)
			wait = 0;
		int ready = poll(&pfd, 1, wait);
		if (ready < 0) {
			if (errno == EINTR)
				continue;
			break;
		}
		if (!ready)
			break;
		ssize_t n = read(fds[0], out + used, size - 1 - used);
		if (n <= 0)
			break;
		used += (size_t)n;
		if (used >= size - 1)
			break;
	}
	close(fds[0]);
	out[used] = 0;
	int status = 0;
	if (waitpid(pid, &status, WNOHANG) != pid) {
		kill(pid, SIGKILL);
		while (waitpid(pid, &status, 0) < 0 && errno == EINTR) {
		}
		return -1;
	}
	return WIFEXITED(status) && !WEXITSTATUS(status) ? 0 : -1;
}

/* --------------------------------------------------------------------------
 * Target validation: http/https only, and the host must not resolve into
 * loopback, RFC 1918, link-local, CGNAT, multicast or ULA space. Without this
 * the object is an SSRF probe that can aim curl at 127.0.0.1 or the LAN.
 */
static bool ipv4_blocked(const unsigned char *b)
{
	return b[0] == 0 || b[0] == 10 || b[0] == 127 || b[0] >= 224 ||
	       (b[0] == 172 && (b[1] & 0xf0) == 16) || (b[0] == 192 && b[1] == 168) ||
	       (b[0] == 169 && b[1] == 254) || (b[0] == 100 && (b[1] & 0xc0) == 64);
}

static bool ipv6_blocked(const unsigned char *b)
{
	static const unsigned char loopback[16] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1};
	if (!memcmp(b, loopback, sizeof(loopback)))
		return true;
	if ((b[0] & 0xfe) == 0xfc) /* fc00::/7 unique local */
		return true;
	if (b[0] == 0xfe && (b[1] & 0xc0) == 0x80) /* fe80::/10 link local */
		return true;
	for (int i = 0; i < 10; i++)
		if (b[i])
			return false;
	if ((b[10] == 0xff && b[11] == 0xff) || (b[10] == 0 && b[11] == 0)) /* ::ffff:a.b.c.d */
		return ipv4_blocked(b + 12);
	return false;
}

static bool address_blocked(const struct sockaddr *addr)
{
	if (addr->sa_family == AF_INET) {
		unsigned char b[4];
		memcpy(b, &((const struct sockaddr_in *)addr)->sin_addr, sizeof(b));
		return ipv4_blocked(b);
	}
	if (addr->sa_family == AF_INET6) {
		unsigned char b[16];
		memcpy(b, &((const struct sockaddr_in6 *)addr)->sin6_addr, sizeof(b));
		return ipv6_blocked(b);
	}
	return true;
}

/* Returns 0 and the host name when the target may be fetched. */
static int check_target(const char *url, char *host, size_t host_size, char *why, size_t why_size)
{
	const char *rest;
	if (!strncmp(url, "http://", 7))
		rest = url + 7;
	else if (!strncmp(url, "https://", 8))
		rest = url + 8;
	else {
		snprintf(why, why_size, "Only http:// and https:// targets are supported");
		return -1;
	}
	size_t authority = strcspn(rest, "/?#");
	if (!authority) {
		snprintf(why, why_size, "Target has no host name");
		return -1;
	}
	const char *colon = memchr(rest, ':', authority);
	if (memchr(rest, '@', authority)) {
		snprintf(why, why_size, "Target must not carry credentials");
		return -1;
	}
	const char *from = rest, *to = rest + authority;
	if (*from == '[') {
		const char *close = memchr(from, ']', (size_t)(to - from));
		if (!close) {
			snprintf(why, why_size, "Target has an invalid IPv6 literal");
			return -1;
		}
		from++;
		to = close;
	} else if (colon)
		to = colon;
	size_t length = (size_t)(to - from);
	if (!length || length >= host_size) {
		snprintf(why, why_size, "Target has no host name");
		return -1;
	}
	snprintf(host, host_size, "%.*s", (int)length, from);
	struct addrinfo hints = {.ai_family = AF_UNSPEC, .ai_socktype = SOCK_STREAM};
	struct addrinfo *list = NULL;
	int rc = getaddrinfo(host, NULL, &hints, &list);
	if (rc || !list) {
		snprintf(why, why_size, "Target host cannot be resolved (%s)", gai_strerror(rc));
		if (list)
			freeaddrinfo(list);
		return -1;
	}
	bool blocked = false;
	for (const struct addrinfo *entry = list; entry && !blocked; entry = entry->ai_next)
		blocked = address_blocked(entry->ai_addr);
	freeaddrinfo(list);
	if (blocked) {
		snprintf(why, why_size, "Target resolves to a private or loopback address");
		return -1;
	}
	return 0;
}

/* --------------------------------------------------------------------------
 * Configuration and node list
 */
static const char *cfg_string(struct uci_context *uci, struct uci_section *section,
			      const char *name, const char *fallback)
{
	const char *value = uci_lookup_option_string(uci, section, name);
	return value && *value ? value : fallback;
}

static unsigned cfg_unsigned(struct uci_context *uci, struct uci_section *section, const char *name,
			     unsigned fallback)
{
	const char *value = uci_lookup_option_string(uci, section, name);
	if (!value || !*value)
		return fallback;
	char *end = NULL;
	unsigned long parsed = strtoul(value, &end, 10);
	return (!end || *end) ? fallback : (unsigned)parsed;
}

static uint64_t cfg_bytes(struct uci_context *uci, struct uci_section *section, const char *name,
			  uint64_t fallback)
{
	const char *value = uci_lookup_option_string(uci, section, name);
	if (!value || !*value)
		return fallback;
	char *end = NULL;
	unsigned long long parsed = strtoull(value, &end, 10);
	return (!end || *end) ? fallback : parsed;
}

static struct uci_section *find_section(struct uci_package *package, const char *type,
					const char *name)
{
	struct uci_element *element;
	uci_foreach_element(&package->sections, element)
	{
		struct uci_section *section = uci_to_section(element);
		if (type && strcmp(section->type, type))
			continue;
		if (name && strcmp(section->name, name))
			continue;
		return section;
	}
	return NULL;
}

static void settings_defaults(void)
{
	memset(&settings, 0, sizeof(settings));
	snprintf(settings.interface, sizeof(settings.interface), "wwan0");
	snprintf(settings.latency_target, sizeof(settings.latency_target), "223.5.5.5");
	snprintf(settings.curl, sizeof(settings.curl), "/usr/bin/curl");
	snprintf(settings.ping, sizeof(settings.ping), "/bin/ping");
	settings.temperature_limit = TEMPERATURE_LIMIT_DEFAULT;
	settings.threads = 4;
	settings.speed_seconds = SPEED_SECONDS_DEFAULT;
	settings.speed_bytes = SPEED_BYTES_DEFAULT;
	settings.burn_seconds = BURN_SECONDS_DEFAULT;
	settings.burn_bytes = BURN_BYTES_DEFAULT;
}

/* Reads /etc/config/udx-speedtest once per call. A missing package is not an
 * error: the built-in defaults plus an empty node list still answer status. */
static void load_config(struct node *nodes, size_t capacity, size_t *count)
{
	settings_defaults();
	*count = 0;
	struct uci_context *uci = uci_alloc_context();
	if (!uci)
		return;
	struct uci_package *package = NULL;
	if (uci_load(uci, "udx-speedtest", &package) != UCI_OK || !package) {
		uci_free_context(uci);
		return;
	}
	struct uci_section *defaults = find_section(package, "defaults", NULL);
	if (defaults) {
		/* Fallbacks repeat the built-in defaults: snprintf must not read the
		 * buffer it is writing. */
		snprintf(settings.interface, sizeof(settings.interface), "%s",
			 cfg_string(uci, defaults, "interface", "wwan0"));
		snprintf(settings.latency_target, sizeof(settings.latency_target), "%s",
			 cfg_string(uci, defaults, "latency_target", "223.5.5.5"));
		snprintf(settings.curl, sizeof(settings.curl), "%s",
			 cfg_string(uci, defaults, "curl", "/usr/bin/curl"));
		snprintf(settings.ping, sizeof(settings.ping), "%s",
			 cfg_string(uci, defaults, "ping", "/bin/ping"));
		settings.threads = cfg_unsigned(uci, defaults, "threads", settings.threads);
		settings.speed_seconds =
		    cfg_unsigned(uci, defaults, "speed_seconds", settings.speed_seconds);
		settings.speed_bytes = cfg_bytes(uci, defaults, "speed_bytes", settings.speed_bytes);
		settings.burn_seconds =
		    cfg_unsigned(uci, defaults, "burn_seconds", settings.burn_seconds);
		settings.burn_bytes = cfg_bytes(uci, defaults, "burn_bytes", settings.burn_bytes);
		const char *limit = cfg_string(uci, defaults, "temperature_limit", NULL);
		if (limit) {
			char *end = NULL;
			double value = strtod(limit, &end);
			if (end && !*end && isfinite(value) && value > 0)
				settings.temperature_limit = value;
		}
	}
	struct uci_element *element;
	uci_foreach_element(&package->sections, element)
	{
		if (*count >= capacity)
			break;
		struct uci_section *section = uci_to_section(element);
		if (strcmp(section->type, "node"))
			continue;
		struct node *node = &nodes[*count];
		memset(node, 0, sizeof(*node));
		snprintf(node->id, sizeof(node->id), "%s", section->name);
		snprintf(node->name, sizeof(node->name), "%s",
			 cfg_string(uci, section, "name", section->name));
		snprintf(node->group, sizeof(node->group), "%s",
			 cfg_string(uci, section, "group", "global"));
		snprintf(node->group_label, sizeof(node->group_label), "%s",
			 cfg_string(uci, section, "group_label",
				    strcmp(node->group, "carrier") ? "Global" : "Carrier"));
		snprintf(node->url, sizeof(node->url), "%s", cfg_string(uci, section, "url", ""));
		snprintf(node->note, sizeof(node->note), "%s", cfg_string(uci, section, "note", ""));
		node->enabled = cfg_unsigned(uci, section, "enabled", 0) != 0;
		node->rtt_ms = -1;
		(*count)++;
	}
	uci_unload(uci, package);
	uci_free_context(uci);
}

static struct node *find_node(struct node *nodes, size_t count, const char *id)
{
	for (size_t i = 0; i < count; i++)
		if (!strcmp(nodes[i].id, id))
			return &nodes[i];
	return NULL;
}

static int probe_rtt(const struct node *node)
{
	char url[1100];
	snprintf(url, sizeof(url), "%s%c_r=%lu", node->url, strchr(node->url, '?') ? '&' : '?',
		 (unsigned long)(now_mono() * 1000));
	char text[64];
	const char *argv[] = {settings.curl,
			      "-s",
			      "-o",
			      "/dev/null",
			      "-r",
			      "0-0",
			      "--max-filesize",
			      "65536",
			      "--proto",
			      "=http,https",
			      "--proto-redir",
			      "=http,https",
			      "--connect-timeout",
			      "3",
			      "--max-time",
			      "4",
			      "--interface",
			      settings.interface,
			      "-w",
			      "%{time_connect}",
			      url,
			      NULL};
	if (run_sync(argv, RTT_TIMEOUT_MS, text, sizeof(text)) < 0)
		return -1;
	char *end = NULL;
	double seconds = strtod(text, &end);
	if (!end || !isfinite(seconds) || seconds <= 0)
		return -1;
	int milliseconds = (int)(seconds * 1000.0 + 0.5);
	if (milliseconds <= 0)
		milliseconds = 1;
	return milliseconds;
}

/* Known round trip first, ascending; unknown last; equal keys keep config
 * order. */
static bool cheaper(const struct node *left, const struct node *right)
{
	if (left->rtt_ms < 0 || (right->rtt_ms >= 0 && right->rtt_ms <= left->rtt_ms))
		return false;
	return true;
}

/* Fills rtt_ms for nodes that may be used, then sorts by it. Skipped entirely
 * while a job runs: extra requests would pollute the measurement. */
static void rank_nodes(struct node *nodes, size_t count)
{
	if (job.active)
		return;
	double deadline = now_mono() + RTT_BUDGET_MS / 1000.0;
	for (size_t i = 0; i < count; i++) {
		if (!nodes[i].enabled || !nodes[i].url[0])
			continue;
		long long age = (long long)time(NULL) - nodes[i].rtt_at;
		if (nodes[i].rtt_at && age >= 0 && age < RTT_SECONDS)
			continue;
		if (now_mono() >= deadline)
			break;
		int rtt = probe_rtt(&nodes[i]);
		if (rtt > 0) {
			nodes[i].rtt_ms = rtt;
			nodes[i].rtt_at = (long long)time(NULL);
		}
	}
	for (size_t i = 1; i < count; i++) {
		struct node hold = nodes[i];
		size_t j = i;
		while (j && cheaper(&hold, &nodes[j - 1])) {
			nodes[j] = nodes[j - 1];
			j--;
		}
		nodes[j] = hold;
	}
}

static struct node *first_usable(struct node *nodes, size_t count)
{
	for (size_t i = 0; i < count; i++)
		if (nodes[i].enabled && nodes[i].url[0])
			return &nodes[i];
	return NULL;
}

/* --------------------------------------------------------------------------
 * Sampling and job control
 */
static void close_bucket(double now)
{
	double span = now - job.bucket_started;
	if (span <= 0)
		span = 1.0;
	if (job.series_len < SERIES_MAX) {
		job.series[job.series_len] = (double)job.bucket_bytes * 8.0 / span;
		job.series_len++;
	}
	job.bucket_bytes = 0;
	job.bucket_started = now;
}

static void sample(uint64_t counter, double now)
{
	uint64_t delta = counter >= job.last_rx ? counter - job.last_rx : 0;
	job.last_rx = counter;
	job.total += delta;
	job.bucket_bytes += delta;
	double span = now - job.last_sample_at;
	job.last_sample_at = now;
	if (span >= 0.05)
		job.speed_now = (double)delta * 8.0 / span;
	if (now - job.bucket_started >= 1.0)
		close_bucket(now);
}

static void kill_children(void)
{
	for (unsigned i = 0; i < MAX_THREADS; i++) {
		if (!job.children[i])
			continue;
		kill(job.children[i], SIGKILL);
		int status = 0;
		while (waitpid(job.children[i], &status, 0) < 0 && errno == EINTR) {
		}
		job.children[i] = 0;
	}
}

static void finish(const char *reason, const char *error)
{
	if (!job.active)
		return;
	job.active = false;
	job.ended = now_mono();
	/* Keep the last partial second: rpcd-free accounting of what was spent. */
	uint64_t counter;
	if (read_counter(&counter) && counter >= job.last_rx) {
		job.total += counter - job.last_rx;
		job.last_rx = counter;
	}
	if (job.bucket_bytes)
		close_bucket(job.ended);
	kill_children();
	snprintf(job.stop_reason, sizeof(job.stop_reason), "%s", reason);
	if (error)
		snprintf(job.error, sizeof(job.error), "%s", error);
	uloop_timeout_cancel(&tick);
	syslog(LOG_INFO, "%s finished (%s): %llu bytes in %.1f s", job.speed ? "speed" : "burn",
	       job.stop_reason, (unsigned long long)job.total, job.ended - job.started);
}

static int spawn_thread(unsigned slot)
{
	char url[1300], rate[32], timeout[12], connect[12];
	snprintf(url, sizeof(url), "%s%c_r=%lu", job.url, strchr(job.url, '?') ? '&' : '?',
		 (unsigned long)(now_mono() * 1000) + slot);
	snprintf(timeout, sizeof(timeout), "%d", REQUEST_SECONDS);
	snprintf(connect, sizeof(connect), "%d", CONNECT_SECONDS);
	const char *argv[32];
	size_t n = 0;
	argv[n++] = settings.curl;
	argv[n++] = "-sS";
	argv[n++] = "-o";
	argv[n++] = "/dev/null";
	argv[n++] = "--proto";
	argv[n++] = "=http,https";
	argv[n++] = "--proto-redir";
	argv[n++] = "=http,https";
	argv[n++] = "--connect-timeout";
	argv[n++] = connect;
	argv[n++] = "--max-time";
	argv[n++] = timeout;
	argv[n++] = "--interface";
	argv[n++] = settings.interface;
	if (job.limit_kbps) {
		/* curl's limit is per process, so split the user's cap by thread. */
		unsigned per = job.limit_kbps / job.threads;
		if (!per)
			per = 1;
		snprintf(rate, sizeof(rate), "%uk", per);
		argv[n++] = "--limit-rate";
		argv[n++] = rate;
	}
	argv[n++] = url;
	argv[n] = NULL;
	pid_t pid = spawn(argv);
	if (pid < 0)
		return -1;
	job.children[slot] = pid;
	job.child_started[slot] = now_mono();
	return 0;
}

static void refill(void)
{
	for (unsigned slot = 0; slot < job.threads; slot++) {
		if (!job.children[slot])
			continue;
		int status = 0;
		pid_t done = waitpid(job.children[slot], &status, WNOHANG);
		if (done != job.children[slot])
			continue;
		job.children[slot] = 0;
		if (!job.active)
			continue;
		if (now_mono() - job.child_started[slot] < 1.0)
			job.fast_exits++;
		if (job.fast_exits > FAST_EXIT_LIMIT && job.total < 1000000) {
			finish("error", "Target is not delivering any data");
			return;
		}
		if (spawn_thread(slot) < 0) {
			finish("error", "Cannot start curl");
			return;
		}
	}
}

static void tick_cb(struct uloop_timeout *timer)
{
	(void)timer;
	if (!job.active)
		return;
	double now = now_mono();
	refill();
	if (!job.active)
		return;
	uint64_t counter;
	if (!read_counter(&counter)) {
		if (++job.read_errors >= COUNTER_MISS_LIMIT)
			finish("sim_removed", "wwan0 byte counters disappeared");
		else
			uloop_timeout_set(&tick, SAMPLE_MS);
		return;
	}
	job.read_errors = 0;
	bool second = now - job.bucket_started >= 1.0;
	sample(counter, now);
	if (second && job.speed) {
		/* Loaded latency once per second: a jump against the idle value is
		 * the bufferbloat signal the UI shows in amber. */
		char text[1024];
		const char *argv[] = {settings.ping, "-c",       "1",   "-W",  "1",
				      "-I",	      settings.interface, settings.latency_target, NULL};
		if (run_sync(argv, PING_TIMEOUT_MS, text, sizeof(text)) == 0) {
			const char *mark = strstr(text, "time=");
			char *end = NULL;
			double value = mark ? strtod(mark + 5, &end) : NAN;
			if (mark && end != mark + 5 && isfinite(value) && value >= 0)
				job.latency = value;
		}
	}
	double elapsed = now - job.started;
	if (job.total >= job.max_bytes) {
		finish("byte_limit", NULL);
		return;
	}
	if (elapsed >= (double)job.max_seconds) {
		finish("time_limit", NULL);
		return;
	}
	if (second) {
		job.temperature = max_temperature();
		if (isfinite(job.temperature) && job.temperature > settings.temperature_limit) {
			char reason[96];
			snprintf(reason, sizeof(reason), "Chassis reached %.1f C", job.temperature);
			finish("thermal", reason);
			return;
		}
	}
	uloop_timeout_set(&tick, SAMPLE_MS);
}

static double ping_once(void)
{
	char text[1024];
	const char *argv[] = {settings.ping, "-c", "1", "-W", "1", "-I", settings.interface,
			      settings.latency_target, NULL};
	if (run_sync(argv, PING_TIMEOUT_MS, text, sizeof(text)) < 0)
		return NAN;
	const char *mark = strstr(text, "time=");
	if (!mark)
		return NAN;
	char *end = NULL;
	double value = strtod(mark + 5, &end);
	return (end != mark + 5 && isfinite(value) && value >= 0) ? value : NAN;
}

/* --------------------------------------------------------------------------
 * Statistics
 */
static unsigned stable_first(void)
{
	if (!job.speed)
		return 0;
	return job.series_len > DISCARD_SECONDS ? DISCARD_SECONDS : job.series_len;
}

static double peak_bps(void)
{
	double peak = 0;
	for (unsigned i = stable_first(); i < job.series_len; i++)
		if (job.series[i] > peak)
			peak = job.series[i];
	return peak;
}

static int compare_double(const void *a, const void *b)
{
	double left = *(const double *)a, right = *(const double *)b;
	return (left < right) ? -1 : (left > right) ? 1 : 0;
}

/* Nearest-rank P90 over the stable window: the value 90 % of the samples stay
 * below. Deliberately neither the mean nor the peak. */
static double percentile90(void)
{
	static double scratch[SERIES_MAX];
	unsigned first = stable_first();
	unsigned count = job.series_len > first ? job.series_len - first : 0;
	if (!count)
		return NAN;
	for (unsigned i = 0; i < count; i++)
		scratch[i] = job.series[first + i];
	qsort(scratch, count, sizeof(double), compare_double);
	unsigned rank = (unsigned)((double)count * 0.9 + 0.5);
	if (!rank)
		rank = 1;
	if (rank > count)
		rank = count;
	return scratch[rank - 1];
}

static double average_bps(void)
{
	double span = (job.active ? now_mono() : job.ended) - job.started;
	if (!(span > 0))
		return 0;
	return (double)job.total * 8.0 / span;
}

/* One-second samples that actually feed the P90. The UI shows "样本不足" when
 * this is small: at 500 Mbps the byte cap ends the run at 4.8 s, so 3 s of
 * discard leaves a single sample and the P90 equals that one point. */
static unsigned stable_samples(void)
{
	unsigned first = stable_first();
	return job.series_len > first ? job.series_len - first : 0;
}

static void reply_json(struct ubus_context *ctx, struct ubus_request_data *request,
		       struct json_object *value)
{
	struct blob_buf buffer = {0};
	blob_buf_init(&buffer, 0);
	blobmsg_add_json_from_string(&buffer,
				    json_object_to_json_string_ext(value, JSON_C_TO_STRING_PLAIN |
									      JSON_C_TO_STRING_NOSLASHESCAPE));
	ubus_send_reply(ctx, request, buffer.head);
	blob_buf_free(&buffer);
	json_object_put(value);
}

static void reply_error(struct ubus_context *ctx, struct ubus_request_data *request,
			struct json_object *value, const char *error)
{
	js_bool(value, "accepted", false);
	js_string(value, "error", error);
	js_int(value, "pid", getpid());
	reply_json(ctx, request, value);
}

static struct json_object *status_document(void)
{
	struct json_object *out = json_object_new_object();
	js_string(out, "mode", job.active || job.started > 0 ? (job.speed ? "speed" : "burn") : NULL);
	js_bool(out, "running", job.active);
	js_string(out, "speed_unit", "bps");
	js_real(out, "speed_now", job.speed_now);
	js_real(out, "avg", average_bps());
	js_real(out, "peak", peak_bps());
	/* P90 exists for the speed test only; the traffic burner never shows it. */
	js_real(out, "p90", job.speed ? percentile90() : NAN);
	js_int(out, "total_bytes", (int64_t)job.total);
	js_real(out, "elapsed",
		job.started > 0 ? (job.active ? now_mono() : job.ended) - job.started : 0);
	js_real(out, "latency_ms", job.speed ? job.latency : NAN);
	js_real(out, "idle_latency_ms", job.speed ? job.idle_latency : NAN);
	js_real(out, "temperature_c", job.temperature);
	js_int(out, "max_bytes", (int64_t)job.max_bytes);
	js_int(out, "max_seconds", job.max_seconds);
	js_int(out, "threads", job.threads);
	js_int(out, "limit_kbps", job.limit_kbps);
	js_int(out, "sample_interval_seconds", 1);
	/* sample_count is the whole series; stable_samples excludes the discarded
	 * slow-start window. The series itself stays in "samples" below. */
	js_int(out, "sample_count", job.series_len);
	js_int(out, "stable_samples", stable_samples());
	js_string(out, "interface", settings.interface);
	js_string(out, "stop_reason", job.stop_reason[0] ? job.stop_reason : NULL);
	js_string(out, "error", job.error[0] ? job.error : NULL);
	struct json_object *node = json_object_new_object();
	js_string(node, "id", job.node[0] ? job.node : NULL);
	js_string(node, "name", job.node_name[0] ? job.node_name : NULL);
	js_string(node, "url", job.url[0] ? job.url : NULL);
	json_object_object_add(out, "node", node);
	struct json_object *samples = json_object_new_array();
	unsigned from = job.series_len > SERIES_REPLY ? job.series_len - SERIES_REPLY : 0;
	for (unsigned i = from; i < job.series_len; i++)
		json_object_array_add(samples, json_object_new_double(job.series[i]));
	json_object_object_add(out, "samples", samples);
	return out;
}

/* --------------------------------------------------------------------------
 * ubus surface
 */
static void handler_status(struct ubus_context *ctx, struct ubus_object *obj,
			   struct ubus_request_data *request, const char *method,
			   struct blob_attr *msg)
{
	(void)obj;
	(void)method;
	(void)msg;
	struct json_object *out = status_document();
	js_bool(out, "accepted", true);
	js_int(out, "pid", getpid());
	reply_json(ctx, request, out);
}

static void handler_stop(struct ubus_context *ctx, struct ubus_object *obj,
			 struct ubus_request_data *request, const char *method, struct blob_attr *msg)
{
	(void)obj;
	(void)method;
	(void)msg;
	struct json_object *out = json_object_new_object();
	if (!job.active) {
		/* Either nothing ever ran, or a protection stopped it a moment ago; in
		 * the second case the caller must still learn why. */
		js_bool(out, "accepted", false);
		js_string(out, "reason", job.stop_reason[0] ? job.stop_reason : NULL);
		js_string(out, "error", job.stop_reason[0] ? "The task has already stopped"
							   : "No task is running");
		js_int(out, "pid", getpid());
		reply_json(ctx, request, out);
		return;
	}
	finish("user", NULL);
	js_bool(out, "accepted", true);
	/* Handlers run one at a time on the uloop, so an accepted stop is always
	 * the whole story: reason is "user" here and never a protection's. A
	 * protection that fired first leaves job.active false and is reported by
	 * the branch above with its own reason. */
	js_string(out, "reason", job.stop_reason);
	js_int(out, "pid", getpid());
	reply_json(ctx, request, out);
}

static struct blob_attr *msg_field(struct blob_attr *msg, const char *name)
{
	struct blob_attr *pos;
	size_t remaining;
	blobmsg_for_each_attr(pos, msg, remaining)
	{
		if (!strcmp(blobmsg_name(pos), name))
			return pos;
	}
	return NULL;
}

static const char *msg_string(struct blob_attr *msg, const char *name)
{
	struct blob_attr *field = msg_field(msg, name);
	return field && blobmsg_type(field) == BLOBMSG_TYPE_STRING ? blobmsg_get_string(field) : NULL;
}

/* Accepts int32 or int64 so the caller may use either width. */
static bool msg_number(struct blob_attr *msg, const char *name, uint64_t *out)
{
	struct blob_attr *field = msg_field(msg, name);
	if (!field)
		return false;
	if (blobmsg_type(field) == BLOBMSG_TYPE_INT64) {
		*out = blobmsg_get_u64(field);
		return true;
	}
	if (blobmsg_type(field) == BLOBMSG_TYPE_INT32) {
		int32_t value = (int32_t)blobmsg_get_u32(field);
		if (value < 0)
			return false;
		*out = (uint64_t)value;
		return true;
	}
	return false;
}

static void handler_start(struct ubus_context *ctx, struct ubus_object *obj,
			  struct ubus_request_data *request, const char *method, struct blob_attr *msg)
{
	(void)obj;
	(void)method;
	struct json_object *out = json_object_new_object();
	const char *mode = msg_string(msg, "mode");
	bool speed;
	if (mode && !strcmp(mode, "speed"))
		speed = true;
	else if (mode && !strcmp(mode, "burn"))
		speed = false;
	else {
		reply_error(ctx, request, out, "mode must be \"speed\" or \"burn\"");
		return;
	}
	if (job.active) {
		js_bool(out, "accepted", false);
		js_bool(out, "busy", true);
		js_string(out, "mode", job.speed ? "speed" : "burn");
		js_string(out, "error", "Another speed test task is already running");
		js_int(out, "pid", getpid());
		reply_json(ctx, request, out);
		return;
	}
	struct node nodes[MAX_NODES];
	size_t count = 0;
	load_config(nodes, MAX_NODES, &count);
	const char *wanted = msg_string(msg, "node");
	struct node *chosen = NULL;
	if (wanted && *wanted) {
		chosen = find_node(nodes, count, wanted);
		if (!chosen) {
			reply_error(ctx, request, out, "Unknown node");
			return;
		}
		if (!chosen->enabled) {
			reply_error(ctx, request, out, "Node is disabled");
			return;
		}
		if (!chosen->url[0]) {
			reply_error(ctx, request, out, "Node has no URL");
			return;
		}
	} else {
		if (speed)
			rank_nodes(nodes, count);
		chosen = first_usable(nodes, count);
		if (!chosen) {
			reply_error(ctx, request, out, "No usable speed test node is configured");
			return;
		}
	}
	char host[256], why[192];
	if (check_target(chosen->url, host, sizeof(host), why, sizeof(why)) < 0) {
		reply_error(ctx, request, out, why);
		return;
	}
	uint64_t value;
	unsigned threads = settings.threads;
	if (msg_number(msg, "threads", &value))
		threads = value > MAX_THREADS ? MAX_THREADS : (unsigned)value;
	if (!threads)
		threads = 1;
	unsigned max_seconds = speed ? settings.speed_seconds : settings.burn_seconds;
	if (msg_number(msg, "max_seconds", &value))
		max_seconds = (unsigned)value;
	uint64_t max_bytes = speed ? settings.speed_bytes : settings.burn_bytes;
	if (msg_number(msg, "max_bytes", &value))
		max_bytes = value;
	unsigned limit_kbps = 0;
	if (msg_number(msg, "limit_kbps", &value))
		limit_kbps = value > 1000000 ? 1000000 : (unsigned)value;
	if (speed) {
		/* The speed test owns its own budget and stops at whichever cap comes
		 * first: 20 s or 300 MB by default, 30 s or 300 MB at the very most,
		 * whatever the caller asks for. */
		if (max_seconds > SPEED_SECONDS_MAX)
			max_seconds = SPEED_SECONDS_MAX;
		if (!max_seconds)
			max_seconds = SPEED_SECONDS_DEFAULT;
		if (max_bytes > SPEED_BYTES_MAX)
			max_bytes = SPEED_BYTES_MAX;
		if (max_bytes < SPEED_BYTES_MIN)
			max_bytes = SPEED_BYTES_MIN;
	} else {
		if (max_seconds < BURN_SECONDS_MIN)
			max_seconds = BURN_SECONDS_MIN;
		if (max_seconds > BURN_SECONDS_MAX)
			max_seconds = BURN_SECONDS_MAX;
		if (max_bytes < BURN_BYTES_MIN)
			max_bytes = BURN_BYTES_MIN;
		if (max_bytes > BURN_BYTES_MAX)
			max_bytes = BURN_BYTES_MAX;
	}
	uint64_t counter;
	if (!read_counter(&counter)) {
		reply_error(ctx, request, out, "No byte counter for the cellular interface");
		return;
	}
	/* Measure the idle round trip before the clock starts, otherwise the pause
	 * would be charged to the average. */
	double idle = speed ? ping_once() : NAN;
	memset(&job, 0, sizeof(job));
	job.active = true;
	job.speed = speed;
	snprintf(job.node, sizeof(job.node), "%s", chosen->id);
	snprintf(job.node_name, sizeof(job.node_name), "%s", chosen->name);
	snprintf(job.url, sizeof(job.url), "%s", chosen->url);
	job.threads = threads;
	job.max_seconds = max_seconds;
	job.max_bytes = max_bytes;
	job.limit_kbps = limit_kbps;
	job.started = now_mono();
	job.bucket_started = job.started;
	job.last_sample_at = job.started;
	job.last_rx = counter;
	job.latency = idle;
	job.idle_latency = idle;
	job.temperature = NAN;
	for (unsigned slot = 0; slot < job.threads; slot++) {
		if (spawn_thread(slot) < 0) {
			finish("error", "Cannot start curl");
			reply_error(ctx, request, out, "Cannot start curl");
			return;
		}
	}
	uloop_timeout_set(&tick, SAMPLE_MS);
	syslog(LOG_INFO, "%s started on %s (%s), %u threads, %u s, %llu bytes",
	       speed ? "speed" : "burn", chosen->id, chosen->url, job.threads, job.max_seconds,
	       (unsigned long long)job.max_bytes);
	js_bool(out, "accepted", true);
	js_bool(out, "busy", false);
	js_string(out, "mode", speed ? "speed" : "burn");
	js_string(out, "node", job.node);
	js_int(out, "pid", getpid());
	reply_json(ctx, request, out);
}

static void handler_nodes(struct ubus_context *ctx, struct ubus_object *obj,
			  struct ubus_request_data *request, const char *method, struct blob_attr *msg)
{
	(void)obj;
	(void)method;
	const char *mode = msg_string(msg, "mode");
	bool speed = mode && !strcmp(mode, "speed");
	struct node nodes[MAX_NODES];
	size_t count = 0;
	load_config(nodes, MAX_NODES, &count);
	if (speed)
		rank_nodes(nodes, count);
	struct json_object *out = json_object_new_object();
	js_bool(out, "accepted", true);
	js_string(out, "mode", speed ? "speed" : "burn");
	struct json_object *list = json_object_new_array();
	bool selected = false;
	for (size_t i = 0; i < count; i++) {
		struct json_object *row = json_object_new_object();
		js_string(row, "id", nodes[i].id);
		js_string(row, "name", nodes[i].name);
		js_string(row, "group", nodes[i].group);
		js_string(row, "group_label", nodes[i].group_label);
		js_string(row, "url", nodes[i].url[0] ? nodes[i].url : NULL);
		js_bool(row, "enabled", nodes[i].enabled);
		js_string(row, "state", !nodes[i].enabled  ? "disabled"
					: !nodes[i].url[0] ? "no-url"
							   : "ready");
		js_int(row, "rtt_ms", nodes[i].rtt_ms > 0 ? nodes[i].rtt_ms : -1);
		js_string(row, "note", nodes[i].note[0] ? nodes[i].note : NULL);
		bool usable = nodes[i].enabled && nodes[i].url[0];
		js_bool(row, "selected", usable && !selected);
		if (usable && !selected)
			selected = true;
		json_object_array_add(list, row);
	}
	json_object_object_add(out, "nodes", list);
	js_bool(out, "running", job.active);
	js_int(out, "pid", getpid());
	reply_json(ctx, request, out);
}

static const struct ubus_method methods[] = {
    UBUS_METHOD_NOARG("status", handler_status),
    UBUS_METHOD_NOARG("start", handler_start),
    UBUS_METHOD_NOARG("stop", handler_stop),
    UBUS_METHOD_NOARG("nodes", handler_nodes),
};
static struct ubus_object_type object_type = UBUS_OBJECT_TYPE("udx.speedtest", methods);

static void connected(struct ubus_context *ctx)
{
	if (!object.id && ubus_add_object(ctx, &object)) {
		syslog(LOG_ERR, "Cannot register udx.speedtest");
		uloop_end();
	}
}

static void terminate(struct uloop_signal *signal)
{
	(void)signal;
	finish("user", NULL);
	uloop_end();
}

int main(int argc, char **argv)
{
	(void)argc;
	(void)argv;
	openlog("udx-speedtest", LOG_PID, LOG_DAEMON);
	signal(SIGPIPE, SIG_IGN);
	if (uloop_init())
		return 1;
	size_t configured = 0;
	load_config(NULL, 0, &configured);
	job.latency = NAN;
	job.idle_latency = NAN;
	job.temperature = NAN;
	tick.cb = tick_cb;
	object = (struct ubus_object){.name = "udx.speedtest",
				      .type = &object_type,
				      .methods = methods,
				      .n_methods = sizeof(methods) / sizeof(methods[0])};
	term_signal = (struct uloop_signal){.signo = SIGTERM, .cb = terminate};
	int_signal = (struct uloop_signal){.signo = SIGINT, .cb = terminate};
	uloop_signal_add(&term_signal);
	uloop_signal_add(&int_signal);
	bus.cb = connected;
	ubus_auto_connect(&bus);
	uloop_run();
	finish("user", NULL);
	ubus_auto_shutdown(&bus);
	uloop_done();
	closelog();
	return 0;
}
