import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
import tarfile
from package_plugin import package_plugin


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.dist = self.root / 'dist'
        self.dist.mkdir()
        (self.dist / 'plugin.json').write_text(json.dumps({'id': 'ai-assistant-app', 'info': {'version': '1.0.0'}}))
        (self.dist / 'module.js').write_text('entrypoint')
        (self.dist / 'chunk.js').write_text('lazy chat')
        (self.dist / 'LICENSE').write_text('license')
        (self.root / 'private.env').write_text('never ship')

    def test_archive_has_installable_root_and_all_built_chunks_only(self):
        archive, checksum, tar_archive, tar_checksum = package_plugin(self.dist, self.root / 'release', 'v1.0.0')
        with zipfile.ZipFile(archive) as bundle:
            self.assertEqual(set(bundle.namelist()), {'ai-assistant-app/plugin.json', 'ai-assistant-app/module.js', 'ai-assistant-app/chunk.js', 'ai-assistant-app/LICENSE'})
            self.assertEqual(bundle.read('ai-assistant-app/chunk.js'), b'lazy chat')
        with tarfile.open(tar_archive, 'r:gz') as bundle, zipfile.ZipFile(archive) as zip_bundle:
            self.assertEqual(set(bundle.getnames()), set(zip_bundle.namelist()))
            for member in bundle.getmembers():
                self.assertTrue(member.isfile())
                self.assertEqual(bundle.extractfile(member).read(), zip_bundle.read(member.name))
        self.assertEqual(tar_checksum.read_text(), hashlib.sha256(tar_archive.read_bytes()).hexdigest() + '  ' + tar_archive.name + '\n')
        self.assertEqual(checksum.read_text(), hashlib.sha256(archive.read_bytes()).hexdigest() + '  ' + archive.name + '\n')

    def test_rejects_tag_mismatch_before_writing_archive(self):
        with self.assertRaisesRegex(ValueError, 'tag'):
            package_plugin(self.dist, self.root / 'release', 'v2.0.0')
        self.assertFalse((self.root / 'release').exists())

    def test_rejects_missing_entrypoint_and_symlinks(self):
        (self.dist / 'module.js').unlink()
        with self.assertRaisesRegex(ValueError, 'module.js'):
            package_plugin(self.dist, self.root / 'release')
        (self.dist / 'module.js').write_text('entrypoint')
        (self.dist / 'secret').symlink_to(self.root / 'private.env')
        with self.assertRaisesRegex(ValueError, 'symbolic'):
            package_plugin(self.dist, self.root / 'release')


if __name__ == '__main__':
    unittest.main()
