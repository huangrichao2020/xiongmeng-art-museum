import re, hashlib, sys, os

W = '/Users/tingchim2pro/.minimax/sessions/mvs_35c54f6b84714f9b989faab39d881fa7/workspace'
src = open(W + '/xiongmeng-art-museum.html', encoding='utf-8').read()

OLD = '    "three": "https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js",\n    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/"'
NEW = '    "three": "./three.module.js",\n    "three/addons/": "./addons/"'

if OLD in src:
    out = src.replace(OLD, NEW)
elif NEW in src:
    out = src
else:
    print('!! importmap pattern not found'); sys.exit(1)

# 注入构建标记：每次构建一个唯一串。
# 客户端登录时跟服务端下发的「当前线上标记」比对，不一致就说明
# 这个标签页打开的是旧页面（老开着不刷新的人会一直看不到新功能）。
if '__XM_BUILD__' in out:
    token = 'b' + hashlib.md5(out.encode()).hexdigest()[:10]
    out = out.replace('__XM_BUILD__', token)
    print('build token', token)
else:
    print('!! __XM_BUILD__ placeholder missing')

os.makedirs(W + '/.deploy', exist_ok=True)
open(W + '/.deploy/index.html', 'w', encoding='utf-8').write(out)

# 同步音频资源（mp3 / wav 采样），避免新增素材时漏传
import shutil
src_audio = W + '/audio'
dst_audio = W + '/.deploy/audio'
if os.path.isdir(src_audio):
    if os.path.isdir(dst_audio):
        shutil.rmtree(dst_audio)
    shutil.copytree(src_audio, dst_audio)
    print('audio synced:', sorted(os.listdir(dst_audio)))

# 校验 importmap 是合法 JSON
m = re.search(r'<script type="importmap">(.*?)</script>', out, re.S)
import json
if m:
    json.loads(m.group(1))
    print('importmap JSON OK')

js = re.search(r'<script type="module">(.*?)</script>', out, re.S).group(1)
open('/tmp/dep.mjs', 'w', encoding='utf-8').write(js)
print('deploy md5', hashlib.md5(out.encode()).hexdigest())
print('braces', js.count('{'), js.count('}'))
