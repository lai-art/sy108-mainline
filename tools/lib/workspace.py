# SPDX-License-Identifier: GPL-2.0-only
"""Public build paths and container invocation."""
from pathlib import Path
import os
import subprocess

PROJECT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('SY108_OUT', PROJECT / 'out')).expanduser().resolve()
OPENWRT = OUT / 'openwrt-build'
DOWNLOADS = Path(os.environ.get('SY108_DOWNLOADS', OUT / 'downloads')).expanduser().resolve()
_SIBLING_LINUX = PROJECT.parent / 'linux-udx710'
LINUX = Path(
    os.environ.get(
        'SY108_LINUX',
        _SIBLING_LINUX if (_SIBLING_LINUX / '.git').exists() else OUT / 'linux',
    )
).expanduser().resolve()
IMAGE = os.environ.get('SY108_BUILD_IMAGE', 'sy108-build:25.12.5')


def docker():
    command = [os.environ.get('SY108_DOCKER', 'docker')]
    if os.environ.get('SY108_DOCKER_CONTEXT'):
        command += ['--context', os.environ['SY108_DOCKER_CONTEXT']]
    return command


def _uid():
    return os.getuid() if hasattr(os, 'getuid') else 0


def _gid():
    return os.getgid() if hasattr(os, 'getgid') else 0


def _cpu_count():
    try:
        affinity = os.sched_getaffinity(0)
        if affinity:
            return len(affinity)
    except (AttributeError, OSError):
        pass
    return os.cpu_count() or 1


def _memory_bytes():
    try:
        pages = os.sysconf('SC_PHYS_PAGES')
        page_size = os.sysconf('SC_PAGE_SIZE')
        if pages > 0 and page_size > 0:
            return pages * page_size
    except (AttributeError, OSError, ValueError):
        pass
    return 0


def resource_limits():
    """Clamp the container limits to what the host can actually provide.

    Docker refuses a ``--cpus`` value larger than the number of available
    processors ("range of CPUs is from 0.01 to 4.00"), which aborted the CI
    run on the four core arm64 runner.  The requested budget is a wish; the
    host's capacity is the hard ceiling, so cap it instead of failing.
    """
    limits = []
    requested = os.environ.get('SY108_JOBS', '6')
    try:
        requested_cpus = float(requested)
    except ValueError:
        requested_cpus = 6.0
    cpus = _cpu_count()
    if requested_cpus > cpus:
        requested_cpus = float(cpus)
    if requested_cpus >= 1:
        limits += ['--cpus', f'{requested_cpus:g}']

    requested_memory = os.environ.get('SY108_MEMORY', '10g')
    total = _memory_bytes()
    if total:
        suffix = requested_memory[-1].lower()
        digits = requested_memory[:-1]
        multipliers = {'k': 1024, 'm': 1024 ** 2, 'g': 1024 ** 3, 't': 1024 ** 4}
        if suffix in multipliers and digits.replace('.', '', 1).isdigit():
            wanted = int(float(digits) * multipliers[suffix])
            if wanted > total:
                limits += ['--memory', f'{int(total * 0.9)}']
            else:
                limits += ['--memory', requested_memory]
        else:
            limits += ['--memory', requested_memory]
    else:
        limits += ['--memory', requested_memory]
    return limits


def container(arguments, offline=False, root=False):
    OUT.mkdir(parents=True, exist_ok=True)
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    (OUT / 'ccache').mkdir(exist_ok=True)
    return docker() + [
        'run',
        '--rm',
        '--platform',
        'linux/arm64',
        '--user',
        '0:0' if root else f'{_uid()}:{_gid()}',
        '--network',
        'none' if offline else 'bridge',
    ] + resource_limits() + [
        '--env',
        'HOME=/tmp',
        '--env',
        'CCACHE_DIR=/output/ccache',
        '--env',
        'KBUILD_BUILD_USER=builder',
        '--env',
        'KBUILD_BUILD_HOST=sy108',
        '--tmpfs',
        '/tmp:rw,exec,nosuid,size=1g',
        '--mount',
        f'type=bind,source={PROJECT},target=/project,readonly',
        '--mount',
        f'type=bind,source={OUT},target=/output',
        '--mount',
        f'type=bind,source={DOWNLOADS},target=/downloads',
        '--workdir',
        '/output/openwrt-build',
        IMAGE,
        *map(str, arguments),
    ]


def run(arguments, **kwargs):
    return subprocess.run(container(arguments), check=True, **kwargs)
