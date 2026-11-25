/* ─────────────────────────────────────────────────────────────
   XM TOUR RECORDER — 注入页面的宣传片录制器
   · 一块 2D 合成画布：WebGL 画面 + 字幕动效 一起录进同一个流
   · 音频：项目自己的 BGM/音效（sfx.master）→ MediaStreamDestination，
          再叠一层自己合成的「动效音」（whoosh / bell / pop / 风噪 / 流水）
   · 相机：连续 Catmull-Rom 轨迹，up 恒为世界竖直，绝不左右翻转
   · 第一视角：摩天轮 / 云霄飞车由乘坐逻辑接管相机
   ───────────────────────────────────────────────────────────── */
(function () {
  const T = window.XM_TOUR;
  if (!T) { console.warn('[tour] XM_TOUR 缺失'); return; }

  const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* 字幕：{t,dur,title,sub,fx,accent}
     fx: card 标题卡 / lower 底部说明条 / type 打字机 / pop 逐字弹入 */
  function drawSub(g, s, age) {
    const W = g.canvas.width, H = g.canvas.height;
    const aIn = Math.min(1, age / .55);
    const aOut = Math.min(1, (s.dur - age) / .40);
    const alpha = Math.max(0, Math.min(aIn, aOut));
    if (alpha <= 0) return;

    g.save();
    g.textBaseline = 'alphabetic';

    if (s.fx === 'card') {
      const e = easeOut(aIn);
      const x = 84 - (1 - e) * 110;
      const y = H - 208;
      g.globalAlpha = alpha;
      g.fillStyle = s.accent || '#ffd089';
      g.fillRect(x - 24, y - 40, 4, 74);
      g.font = '700 46px ' + FONT;
      g.fillStyle = '#ffffff';
      g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = 16;
      g.fillText(s.title, x, y);
      const lw = g.measureText(s.title).width;
      g.shadowBlur = 0;
      g.fillStyle = s.accent || '#ffd089';
      g.fillRect(x, y + 14, lw * e, 2.5);
      if (s.sub) {
        g.font = '400 23px ' + FONT;
        g.fillStyle = 'rgba(238,244,252,.92)';
        g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 10;
        g.fillText(s.sub, x, y + 44);
      }
    } else if (s.fx === 'lower') {
      const e = easeOut(aIn);
      const w = Math.min(W - 120, 1120), h = 76;
      const x = (W - w) / 2, y = H - 138 - (1 - e) * 28;
      g.globalAlpha = alpha * .92;
      g.fillStyle = 'rgba(8,14,26,.62)';
      roundRect(g, x, y, w, h, 18); g.fill();
      g.strokeStyle = 'rgba(255,208,137,.55)'; g.lineWidth = 2;
      roundRect(g, x, y, w, h, 18); g.stroke();
      g.shadowBlur = 10; g.shadowColor = 'rgba(0,0,0,.5)';
      g.font = '600 29px ' + FONT;
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.fillText(s.title + (s.sub ? '   ' + s.sub : ''), W / 2, y + h / 2 + 11);
      g.textAlign = 'left';
    } else if (s.fx === 'type' || s.fx === 'pop') {
      const y = H - 196;
      g.globalAlpha = alpha;
      g.font = '700 44px ' + FONT;
      g.fillStyle = '#fff';
      g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 16;
      if (s.fx === 'pop') {
        const chars = [...s.title];
        const per = Math.max(.045, (s.dur * .45) / chars.length);
        const widths = chars.map(ch => g.measureText(ch).width);
        const total = widths.reduce((a, b) => a + b, 0);
        let cx = W / 2 - total / 2;
        chars.forEach((ch, i) => {
          const t = Math.max(0, Math.min(1, (age - i * per) / .28));
          const sc = .55 + .45 * easeOut(t);
          g.save();
          g.translate(cx + widths[i] / 2, y);
          g.scale(sc, sc);
          g.fillText(ch, -widths[i] / 2, 0);
          g.restore();
          cx += widths[i];
        });
      } else {
        const n = Math.min(s.title.length, Math.floor(age / .05));
        g.textAlign = 'center';
        g.fillText(s.title.slice(0, n), W / 2, y);
        g.textAlign = 'left';
      }
      if (s.sub) {
        g.font = '400 22px ' + FONT;
        g.fillStyle = 'rgba(238,244,252,.9)';
        g.textAlign = 'center';
        g.fillText(s.sub, W / 2, y + 38);
        g.textAlign = 'left';
      }
    }
    g.restore();
  }

  /* ── 动效音 ───────────────────────────────────────────── */
  function makeSfx(ctx, dest) {
    const S = {};
    const env = (g, t, a, d, peak) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    };
    const noiseBuf = (dur) => {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return b;
    };
    S.whoosh = (t, vol = .5) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf(1.1);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(320, t);
      bp.frequency.exponentialRampToValueAtTime(4200, t + .55);
      bp.frequency.exponentialRampToValueAtTime(260, t + 1.05);
      const g = ctx.createGain(); env(g, t, .10, .95, .52 * vol);
      src.connect(bp); bp.connect(g); g.connect(dest);
      src.start(t); src.stop(t + 1.15);
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueTime(42, t + .5);
      const og = ctx.createGain(); env(og, t, .01, .55, .48 * vol);
      o.connect(og); og.connect(dest); o.start(t); o.stop(t + .7);
    };
    S.pop = (t, vol = .5) => {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(760, t); o.frequency.exponentialRampToValueAtTime(1180, t + .08);
      const g = ctx.createGain(); env(g, t, .006, .16, .34 * vol);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + .25);
    };
    S.bell = (t, vol = .5, base = 880) => {
      [1, 2.01, 3.02].forEach((m, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * m;
        const g = ctx.createGain(); env(g, t, .005, 1.5 - i * .35, (.28 / (i + 1)) * vol);
        o.connect(g); g.connect(dest); o.start(t); o.stop(t + 1.7);
      });
    };
    S.water = (t, dur, vol = .5) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf(dur + .2); src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = .7;
      const lfo = ctx.createOscillator(); lfo.frequency.value = .6;
      const lg = ctx.createGain(); lg.gain.value = 620;
      lfo.connect(lg); lg.connect(bp.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(.17 * vol, t + .7);
      g.gain.setValueAtTime(.17 * vol, t + dur - .8);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      src.connect(bp); bp.connect(g); g.connect(dest);
      src.start(t); src.stop(t + dur + .1); lfo.start(t); lfo.stop(t + dur + .1);
    };
    S.wind = (t, dur, vol = .5) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf(dur + .2); src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(400, t);
      lp.frequency.linearRampToValueAtTime(1500, t + dur * .6);
      lp.frequency.linearRampToValueAtTime(500, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t);
      g.gain.linearRampToValueAtTime(.20 * vol, t + 1.0);
      g.gain.setValueAtTime(.20 * vol, t + Math.max(1.1, dur - 1.0));
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      src.connect(lp); lp.connect(g); g.connect(dest);
      src.start(t); src.stop(t + dur + .1);
    };
    S.rumble = (t, dur, vol = .5) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf(dur + .2); src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170; lp.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t);
      g.gain.linearRampToValueAtTime(.42 * vol, t + .5);
      g.gain.setValueAtTime(.42 * vol, t + Math.max(1, dur - .5));
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      src.connect(lp); lp.connect(g); g.connect(dest);
      src.start(t); src.stop(t + dur + .1);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(520, t + dur * .7);
      const og = ctx.createGain(); env(og, t, dur * .5, .6, .045 * vol);
      o.connect(og); og.connect(dest); o.start(t); o.stop(t + dur + .2);
    };
    S.chord = (t, vol = .5) => {
      [0, 4, 7, 12, 16].forEach((semi, i) => {
        const f = 261.63 * Math.pow(2, semi / 12);
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const g = ctx.createGain(); env(g, t + i * .06, .05, 3.2, .16 * vol);
        o.connect(g); g.connect(dest); o.start(t + i * .06); o.stop(t + 4.2);
      });
      S.bell(t + .1, vol * .8, 1046.5);
    };
    return S;
  }

  /* ── Catmull-Rom 轨迹 ────────────────────────────────── */
  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  function sampleCurve(pts, u) {
    const n = pts.length;
    const f = Math.max(0, Math.min(0.9999, u)) * (n - 1);
    const i = Math.floor(f), tt = f - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[Math.min(n - 1, i + 1)], p3 = pts[Math.min(n - 1, i + 2)];
    return [0, 1, 2].map(k => catmull(p0[k], p1[k], p2[k], p3[k], tt));
  }

  /* ── 主流程 ───────────────────────────────────────────── */
  window.__TOUR_REC = {
    async run(plan) {
      const W = plan.width || 1280, H = plan.height || 720;
      const FPS = plan.fps || 30;

      /* BGM 开起来 */
      try { if (!T.sfx.on) T.sfx.setOn(true); } catch (e) { }
      const ctx = T.sfx.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { } }
      const dest = ctx.createMediaStreamDestination();
      /* 项目自己的 master 直接录进来几乎听不见（户外 BGM 增益本来就压到 .30，
         合成器整体 mean 只有 -38dB）。这里给录音总线加前置增益 + 限幅，
         让录进片子的是「能听清」的版本，不影响玩家实际听到的音量。 */
      const pre = ctx.createGain(); pre.gain.value = 4.2;
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -8; lim.knee.value = 8; lim.ratio.value = 8;
      lim.attack.value = .004; lim.release.value = .18;
      pre.connect(lim); lim.connect(dest);
      try { T.sfx.master.connect(pre); } catch (e) { }
      try { if (T.sfx.musicBus) T.sfx.musicBus.gain.value = .55; } catch (e) { }
      /* clean 模式：字幕 / 白闪转场交给 Remotion 去做，画面里不烧任何叠加层。
         同时把项目 BGM 彻底静音，避免和 Remotion 里统一铺的 BGM 撞车。
         环境音（风、雨、设施音）仍保留在 master 上 —— setOn(false) 不敢用，
         它会把 master 整个静音，环境音会一起丢。
         不能只设 musicBus.gain=0：updateBgmMix 每帧会把它覆盖回 .30/.52。
         直接 disconnect musicBus —— BGM 走 musicBus→comp→master，
         断掉后 BGM 彻底不响；环境音直接挂 master，不受影响。 */
      if (plan.clean) {
        try { if (T.sfx.musicBus) T.sfx.musicBus.disconnect(); } catch (e) { }
        try { if (T.sfx.master) T.sfx.master.gain.value = .85; } catch (e) { }
      }
      const S = makeSfx(ctx, pre);

      /* 合成画布 */
      const cvs = document.createElement('canvas');
      cvs.width = W; cvs.height = H;
      cvs.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
      document.body.appendChild(cvs);
      const g = cvs.getContext('2d', { alpha: false });

      const stream = cvs.captureStream(FPS);
      const at = dest.stream.getAudioTracks()[0];
      if (at) stream.addTrack(at);

      const mimes = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
      const mime = mimes.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || 'video/webm';
      const chunks = [];
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 9e6 });
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

      /* 时间轴 */
      const segs = plan.segments;
      const total = segs.reduce((a, s) => a + s.dur, 0);
      let acc = 0;
      segs.forEach(s => { s._t0 = acc; acc += s.dur; });

      const events = [];
      /* clean 模式：字幕 / 白闪转场 / 合成动效音都不烧进画面，
         全部交给 Remotion 按帧编排（精确到帧，还能做真正的交叉淡化）。
         这里只保留项目自身的环境音（风、雨、设施音）。 */
      if (!plan.clean) {
        segs.forEach(s => {
          const list = s.sfx ? (Array.isArray(s.sfx) ? s.sfx : [s.sfx]) : [];
          list.forEach((f, i) => {
            const name = Array.isArray(f) ? f[0] : f;
            const arg = Array.isArray(f) ? (f.length > 1 ? f.slice(1) : undefined)
                                        : (i === 0 ? s.sfxArg : undefined);
            events.push({ t: s._t0 + (s.sfxAt || 0) + i * (s.sfxGap || .5), fn: name, arg });
          });
          if (s.sub) events.push({ t: s._t0 + (s.subAt || 0), fn: 'pop' });
        });
        events.sort((a, b) => a.t - b.t);
      }
      let evI = 0;

      /* 交出相机控制权 */
      T.stopDirector();
      if (T.controls) T.controls.enableDamping = false;

      /* ── ride 段相机接管钩子 ──
         项目的 updateWheelRide 每帧都会把相机拉回「座位正前方 8 米」，
         录制器的 rAF 回调排在项目渲染循环之后，改了也会被立刻覆盖。
         所以在这里注册一个钩子，让项目在设置相机之前先问我们：
         返回 true = 相机归我们管，项目别动。
         这个钩子必须按「当前段」工作，所以每帧从全局状态里读当前段。 */
      let curSeg = null;
      window.__XM_CAM_HOOK = function (wheelSys) {
        const seg = curSeg;
        if (!seg || seg.kind !== 'ride') return false;
        if (!T.THREE || !T.camera) return false;
        const cam = T.camera;

        if (seg.ride === 'wheel') {
          /* 摩天轮：相机跟着吊篮走，但沿 z 轴推出轮平面。
             轮圈在 z=36±1（两个圆），轮平面是 x-y。
             相机若留在笼子里（z=36），朝任何带 z 分量的方向看都会正对轮圈，
             一条弧横贯画面 —— 实测 13 秒时轮圈顶部正好糊在镜头上。
             推到 z=38.6 之后，两个轮圈只在视野边缘掠过，中心只剩雪城。
             视线固定朝正西（-x，z 分量为 0），所以永远不会被轮圈挡住。 */
          const cab = wheelSys.cab;
          if (!cab) return false;
          const cp = new T.THREE.Vector3();
          cab.getWorldPosition(cp);
          cam.position.set(cp.x, cp.y + .55, cp.z + 2.6);
          const look = new T.THREE.Vector3(-1, -.13, 0).normalize();
          cam.up.set(0, 1, 0);
          cam.lookAt(cam.position.x + look.x, cam.position.y + look.y, cam.position.z + look.z);
          return true;
        }

        if (seg.ride === 'coaster') {
          /* 云霄飞车：位置用车头，视线沿轨道前方但限幅俯仰。
             原逻辑盯着车头前 8m，俯冲段那点已经在很低处，画面变成死盯地面；
             而且 camera.up 被设成轨道法线，俯冲时整个画面歪过去。
             这里 up 恒为世界竖直，俯仰限制在 [-0.28, +0.30]，地平线始终在画面里。 */
          const co = T.amusement && T.amusement.coaster;
          if (!co || !co.cars || !co.cars.length) return false;
          const car0 = co.cars[0];
          car0.updateMatrixWorld(true);
          const wp = new T.THREE.Vector3(0, .70, .24).applyMatrix4(car0.matrixWorld);
          cam.position.copy(wp);
          const fwd = new T.THREE.Vector3(0, .56, 8.0).applyMatrix4(car0.matrixWorld).sub(wp).normalize();
          let pitch = fwd.y;
          if (pitch > .30) pitch = .30;
          if (pitch < -.28) pitch = -.28;
          const flat = Math.sqrt(Math.max(1e-6, 1 - pitch * pitch));
          const dir = new T.THREE.Vector3(fwd.x * flat, pitch, fwd.z * flat).normalize();
          cam.up.set(0, 1, 0);
          cam.lookAt(cam.position.x + dir.x, cam.position.y + dir.y, cam.position.z + dir.z);
          return true;
        }
        return false;
      };

      const recStart = performance.now();
      rec.start(250);

      let raf = 0, frames = 0, lastT = 0, done = false, prevSeg = null;
      const fpsSamples = [];
      let result = null;

      function tick() {
        const now = performance.now();
        const el = (now - recStart) / 1000;
        if (el > total) { finish(); return; }

        while (evI < events.length && events[evI].t <= el) {
          const e = events[evI++];
          try {
            const args = Array.isArray(e.arg) ? e.arg : [e.arg];
            if (typeof e.fn === 'function') e.fn(ctx.currentTime + 0.02, ...args);
            else if (S[e.fn]) S[e.fn](ctx.currentTime + 0.02, ...args);
          } catch (err) { }
        }

        const seg = segs.find(s => el >= s._t0 && el < s._t0 + s.dur);
        curSeg = seg;
        /* 段切换：离开 ride 段必须下车，否则相机一直被乘坐逻辑占着 */
        if (prevSeg && prevSeg !== seg && prevSeg.kind === 'ride') {
          try { T.stopRide(); } catch (e) { }
          if (T.fp) T.fp.on = false;
        }
        prevSeg = seg;
        if (seg) {
          const u = (el - seg._t0) / seg.dur;
          if (seg.kind === 'cam') {
            if (seg.hour != null) T.setHour(seg.hour);
            const p = sampleCurve(seg.pos, u);
            const l = sampleCurve(seg.look, u);
            T.camera.position.set(p[0], p[1], p[2]);
            T.controls.target.set(l[0], l[1], l[2]);
            if (seg.fov) { T.camera.fov = seg.fov; T.camera.updateProjectionMatrix(); }
            T.camera.up.set(0, 1, 0);
            T.camera.lookAt(T.controls.target);
          } else if (seg.kind === 'ride') {
            if (!seg._started) {
              seg._started = true;
              try {
                if (seg.ride === 'wheel') T.rideWheel(seg.rideMode || 'top');
                else if (seg.ride === 'coaster') T.rideCoaster();
              } catch (e) { console.warn('[tour] ride fail', e); }
            }
            /* 乘坐时玩家朝向由 fp.yaw 决定（吊舱不带着人转） */
            if (seg.yaw != null && T.fp) T.fp.yaw = seg.yaw;
            /* ride 段的相机由 __XM_CAM_HOOK 接管（见 installRideHook）：
               必须在渲染前设置，录制器的 rAF 回调晚于项目的渲染循环，
               在 tick 里改相机会被项目每帧覆盖掉。 */
          }
        }

        /* 画面 + 字幕 + 转场 */
        try { g.drawImage(T.renderer.domElement, 0, 0, W, H); } catch (e) { }
        if (!plan.clean) {
          for (const s of (plan.subs || [])) {
            const age = el - s.t;
            if (age >= 0 && age <= s.dur) drawSub(g, s, age);
          }
          for (const f of (plan.flashes || [])) {
            const age = el - f.t;
            if (age >= 0 && age <= f.dur) {
              g.save();
              g.globalAlpha = Math.sin(Math.PI * (age / f.dur)) * (f.a || .5);
              g.fillStyle = '#ffffff';
              g.fillRect(0, 0, W, H);
              g.restore();
            }
          }
        }

        frames++;
        if (lastT) fpsSamples.push(1000 / (now - lastT));
        lastT = now;
        raf = requestAnimationFrame(tick);
      }

      function finish() {
        if (done) return; done = true;
        cancelAnimationFrame(raf);
        try { rec.stop(); } catch (e) { }
        setTimeout(() => {
          const blob = new Blob(chunks, { type: mime });
          result = {
            ok: true, mime, size: blob.size, frames,
            avgFps: fpsSamples.length ? +(fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length).toFixed(1) : 0,
            minFps: fpsSamples.length ? +Math.min.apply(null, fpsSamples).toFixed(1) : 0
          };
          window.__TOUR_RESULT = result;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = plan.filename || 'xm-tour.mp4';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 6000);
        }, 900);
      }

      raf = requestAnimationFrame(tick);
      return { ok: true, mime, total };
    }
  };
})();
