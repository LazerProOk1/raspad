precision mediump float;

uniform sampler2D uMainSampler;
varying vec2 outTexCoord;
uniform float uTime;
uniform float uIntensity;
uniform float uFlickerHz;

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
  vec4 color = texture2D(uMainSampler, outTexCoord);
  float flicker = uFlickerHz > 0.0 ? (0.7 + 0.3 * sin(uTime * 6.2831853 * uFlickerHz)) : 1.0;
  float noise = (random(outTexCoord + vec2(uTime * 0.17, uTime * 0.11)) - 0.5) * (uIntensity * flicker);
  gl_FragColor = vec4(color.rgb + noise, color.a);
}
