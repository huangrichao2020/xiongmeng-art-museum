#!/usr/bin/env python3
"""江南古村 · 构建产物
把 index.html + src/ + three 运行时整理到 .deploy-jiangnan/ 供本地预览与部署。"""
import os, shutil, sys, re, hashlib, time

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('JN_OUT') or os.path.join(ROOT, '.deploy-jiangnan')
SRC = os.path.join(ROOT, 'src')
MAIN_DEPLOY = os.path.join(os.path.dirname(ROOT), '.deploy')   # 主站的 three 运行时

def rm(path):
    if os.path.isdir(path) and not os.path.islink(path):
        shutil.rmtree(path)
    elif os.path.exists(path) or os.path.islink(path):
        os.remove(path)

# 注意：不要整目录删掉 OUT —— 本地预览服务器（http.server 8900）的工作目录
# 就是 .deploy-jiangnan，删掉之后目录 inode 消失，服务器还在但所有相对路径 404。
# 改成原地同步：覆盖同名文件 + 删掉源里已不存在的旧文件。
os.makedirs(os.path.join(OUT, 'src'), exist_ok=True)

# 页面
shutil.copy2(os.path.join(ROOT, 'index.html'), os.path.join(OUT, 'index.html'))
# 图标（浏览器自动要 /favicon.ico，缺了就是一条 404）
if os.path.exists(os.path.join(ROOT, 'favicon.svg')):
    shutil.copy2(os.path.join(ROOT, 'favicon.svg'), os.path.join(OUT, 'favicon.svg'))

# 源码
copied = set()
for base, _, files in os.walk(SRC):
    rel = os.path.relpath(base, SRC)
    dst = os.path.join(OUT, 'src', rel) if rel != '.' else os.path.join(OUT, 'src')
    os.makedirs(dst, exist_ok=True)
    for f in files:
        if f.endswith('.js'):
            shutil.copy2(os.path.join(base, f), os.path.join(dst, f))
            copied.add(os.path.normpath(os.path.join('src', rel, f)))
# 清掉 OUT 里源已删除的旧 js（保持目录 inode 不变）
for base, _, files in os.walk(os.path.join(OUT, 'src')):
    for f in files:
        p = os.path.join(base, f)
        rel = os.path.relpath(p, OUT)
        if f.endswith('.js') and rel not in copied:
            os.remove(p)

# three 运行时（只拷需要的）
shutil.copy2(os.path.join(MAIN_DEPLOY, 'three.module.js'), os.path.join(OUT, 'three.module.js'))
addons_dst = os.path.join(OUT, 'addons')
# 主站 .deploy 里有 controls / utils；objects（Sky）只在本工程里，两处都找
for sub in ('controls', 'utils', 'objects', 'postprocessing', 'shaders', 'math'):
    dst = os.path.join(addons_dst, sub)
    os.makedirs(dst, exist_ok=True)
    for base in (MAIN_DEPLOY, ROOT):
        src = os.path.join(base, 'addons', sub)
        if not os.path.isdir(src):
            continue
        for f in os.listdir(src):
            if f.endswith('.js'):
                shutil.copy2(os.path.join(src, f), os.path.join(dst, f))

# 构建标记
html = open(os.path.join(OUT, 'index.html'), encoding='utf-8').read()
token = hashlib.md5(('%.3f' % time.time()).encode()).hexdigest()[:10]
html = html.replace('<title>', '<meta name="xm-build" content="%s">\n<title>' % token)
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(html)

# importmap 自检
m = re.search(r'<script type="importmap">(.*?)</script>', html, re.S)
assert m, 'importmap 丢了'
import json
json.loads(m.group(1))
print('importmap JSON OK')

# 引用的模型模块是否都在
main_src = open(os.path.join(ROOT, 'src', 'main.js'), encoding='utf-8').read()
mm = re.search(r"MODEL_MODULES\s*=\s*\[([^\]]*)\]", main_src)
mods = re.findall(r"'(\w+)'", mm.group(1)) if mm else []
for mo in mods:
    p = os.path.join(OUT, 'src', 'models', mo + '.js')
    if not os.path.exists(p):
        print('  [缺] models/%s.js' % mo)
print('模型模块:', ', '.join(mods))
print('build token', token)
print('deploy md5', hashlib.md5(open(os.path.join(OUT, 'index.html'), 'rb').read()).hexdigest())
