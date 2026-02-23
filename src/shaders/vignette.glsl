precision mediump float;

uniform sampler2D uMainSampler;
varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord;
  vec2 center = vec2(0.5, 0.5);
  float dist = distance(uv, center);
  float vignette = smoothstep(0.8, 0.35, dist);
  vec4 color = texture2D(uMainSampler, uv);
  gl_FragColor = vec4(color.rgb * vignette, color.a);
}
