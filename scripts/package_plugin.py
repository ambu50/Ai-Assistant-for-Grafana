"""Package an already-built Grafana app without including the source tree."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile


def package_plugin(source, output, tag=None):
    source, output = Path(source), Path(output)
    metadata = json.loads((source / 'plugin.json').read_text())
    plugin_id, version = metadata['id'], metadata['info']['version']
    if not re.fullmatch(r'[a-z0-9-]+', plugin_id) or not re.fullmatch(r'\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?', version):
        raise ValueError('Invalid plugin identity or version.')
    if tag is not None and tag != 'v' + version:
        raise ValueError('Release tag does not match the built plugin version.')
    for required in ['plugin.json', 'module.js', 'LICENSE']:
        if not (source / required).is_file():
            raise ValueError('Missing build file: ' + required)
    files = sorted(path for path in source.rglob('*') if path.is_file() or path.is_symlink())
    if any(path.is_symlink() for path in files):
        raise ValueError('Build files must not contain symbolic links.')
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'{plugin_id}-{version}.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for path in files:
            bundle.write(path, str(Path(plugin_id) / path.relative_to(source)))
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip() is not None:
            raise ValueError('Archive integrity check failed.')
    checksum = archive.with_suffix('.zip.sha256')
    checksum.write_text(hashlib.sha256(archive.read_bytes()).hexdigest() + '  ' + archive.name + '\n')
    return archive, checksum


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default='dist')
    parser.add_argument('--output', default='release')
    parser.add_argument('--tag')
    args = parser.parse_args()
    for path in package_plugin(args.source, args.output, args.tag):
        print(path)
