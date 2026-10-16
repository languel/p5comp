export function keyColor(settings = {}) {
  if (settings.keyMode === "black") return [0, 0, 0];
  if (settings.keyMode === "white") return [1, 1, 1];
  const hex = /^#[0-9a-f]{6}$/i.test(settings.keyColor || "")
    ? settings.keyColor
    : "#00ff00";
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}
export function keyAlpha(rgb, settings = {}) {
  if (!settings.keyMode || settings.keyMode === "none") return 1;
  const color = keyColor(settings),
    distance = Math.sqrt(
      rgb.reduce((s, v, i) => s + (v - color[i]) ** 2, 0) / 3,
    );
  const edge = Math.max(0, Number(settings.keyThreshold ?? 0.04)),
    soft = Math.max(0.001, Number(settings.keySoftness ?? 0.08));
  const x = Math.max(0, Math.min(1, (distance - edge) / soft));
  return x * x * (3 - 2 * x);
}
export function createVideoKey(video, scene, settings, onError = () => {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "keyed-video";
  canvas.hidden = true;
  scene.append(canvas);
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) {
    return {
      update() {
        if (settings.keyMode && settings.keyMode !== "none")
          onError("Video keying requires WebGL.");
      },
      frame: () => video,
      destroy: () => canvas.remove(),
    };
  }
  const shader = (type, text) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, text);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw Error(gl.getShaderInfoLog(s));
    return s;
  };
  const vertex = shader(
    gl.VERTEX_SHADER,
    "attribute vec2 position; varying vec2 uv; void main(){ uv=(position+1.0)*.5; gl_Position=vec4(position,0.,1.); }",
  );
  const fragment = shader(
    gl.FRAGMENT_SHADER,
    `precision mediump float;
    varying vec2 uv; uniform sampler2D image; uniform vec3 key;
    uniform float threshold; uniform float softness; uniform float lift;
    void main(){vec4 pixel=texture2D(image,uv);float d=length(pixel.rgb-key)/sqrt(3.0);
      float alpha=pixel.a*smoothstep(threshold,threshold+max(.001,softness),d);
      gl_FragColor=vec4(clamp(pixel.rgb*lift,0.,1.),alpha);}`,
  );
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const uniforms = Object.fromEntries(
    ["key", "threshold", "softness", "lift"].map((n) => [
      n,
      gl.getUniformLocation(program, n),
    ]),
  );
  let disposed = false,
    request = null,
    failed = false;
  const update = () => {
    const enabled = !!settings.keyMode && settings.keyMode !== "none";
    canvas.hidden = !enabled;
    scene.classList.toggle("keyed-capture", enabled);
    canvas.style.transform = settings.flipX ? "scaleX(-1)" : "";
  };
  const draw = () => {
    if (disposed) return;
    update();
    if (!canvas.hidden && video.readyState >= 2 && video.videoWidth) {
      try {
        if (
          canvas.width !== video.videoWidth ||
          canvas.height !== video.videoHeight
        ) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(program);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          video,
        );
        gl.uniform3fv(uniforms.key, keyColor(settings));
        gl.uniform1f(uniforms.threshold, Number(settings.keyThreshold ?? 0.04));
        gl.uniform1f(uniforms.softness, Number(settings.keySoftness ?? 0.08));
        gl.uniform1f(uniforms.lift, Number(settings.keyLift ?? 1));
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } catch (e) {
        if (!failed) {
          failed = true;
          onError("Video key: " + e.message);
        }
      }
    }
    request = video.requestVideoFrameCallback
      ? video.requestVideoFrameCallback(draw)
      : requestAnimationFrame(draw);
  };
  draw();
  const observer = new MutationObserver(() => {
    if (!scene.isConnected) destroy();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  function destroy() {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(request);
    else cancelAnimationFrame(request);
    gl.deleteTexture(texture);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    canvas.remove();
  }
  return {
    update,
    frame: () => (canvas.hidden || !video.videoWidth ? video : canvas),
    destroy,
  };
}
