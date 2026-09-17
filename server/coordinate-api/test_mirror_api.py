import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen


class MirrorTests(unittest.TestCase):
    def test_public_lights(self):
        with tempfile.TemporaryDirectory() as folder:
            os.environ['COORDINATE_DB'] = str(Path(folder) / 'lights.db')
            archive = Path(__file__).resolve().parents[2] / 'data/archive.json'
            os.environ['COORDINATE_ARCHIVE'] = str(archive)
            spec = importlib.util.spec_from_file_location('mirror_api', Path(__file__).with_name('mirror_api.py'))
            api = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(api)
            api.initialize()
            server = api.ThreadingHTTPServer(('127.0.0.1', 0), api.Handler)
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            base = 'http://127.0.0.1:' + str(server.server_port)
            visitor = '12345678-1234-4123-8123-123456789abc'
            record = json.loads(archive.read_text())['records'][0]['id']

            def request(path, method='GET', data=None):
                req = Request(base + path, method=method, data=json.dumps(data).encode() if data else None,
                              headers={'Content-Type': 'application/json'})
                with urlopen(req, timeout=5) as response:
                    return json.load(response)
            try:
                self.assertTrue(request('/api/coordinates/health')['ok'])
                path = '/api/coordinates/' + record + '/light'
                for _ in range(2):
                    self.assertEqual(request(path, 'PUT', dict(visitor_id=visitor)), dict(liked=True, likes=1))
                counts = request('/api/coordinates/likes?visitor_id=' + visitor)
                self.assertEqual(counts['counts'][record], 1)
                self.assertIn(record, counts['viewerLikes'])
                self.assertEqual(request('/api/coordinates/ranking')['ranking'][0]['likes'], 1)
                self.assertEqual(request(path, 'DELETE', dict(visitor_id=visitor)), dict(liked=False, likes=0))
                self.assertEqual(request('/api/coordinates/likes')['counts'], {})
                with self.assertRaises(HTTPError) as error:
                    request('/api/coordinates/9999/light', 'PUT', dict(visitor_id=visitor))
                self.assertEqual(error.exception.code, 400)
                self.assertEqual(api.distribution([])['max'], 0)
            finally:
                server.shutdown()
                server.server_close()


if __name__ == '__main__':
    unittest.main()
