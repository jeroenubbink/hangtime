// The toybox look both games share: soft two-tone shading, a bright rim round everything that
// stands up, and punchier colour. It patches three.js's own shader chunks, so every lit material
// (Lambert, Standard, Phong) picks it up without being swapped out. Import it before the first frame.
import * as THREE from 'three';

const C = THREE.ShaderChunk;

// Sunlight falls off in a short soft step instead of a long gradient: faces are lit or in shade,
// with a slight lift on faces that look straight at the sun so round shapes still read as round
const RAMP = `
float toonRamp( float d ) {
  return smoothstep( 0.0, 0.16, d ) * ( 0.84 + 0.16 * smoothstep( 0.45, 0.85, d ) );
}
`;
const DOT = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
const TOON_DOT = 'float dotNL = toonRamp( dot( geometryNormal, directLight.direction ) );';
for (const k of ['lights_lambert_pars_fragment', 'lights_physical_pars_fragment']) {
  if (!C[k].includes(DOT)) throw new Error('toon: three.js lighting changed, ' + k);
  C[k] = RAMP + C[k].replace(DOT, TOON_DOT);
}

// Rim light: a glow along the silhouette of walls, cars and trees, tinted by the sky light so it
// fades at night. Faces pointing up (ground, roofs) get none, or the far ground would glow.
C.lights_fragment_end += `
#if defined( RE_IndirectDiffuse )
{
  vec3 upV = ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz;
  float rim = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 3.0 );
  rim *= 1.0 - abs( dot( geometryNormal, upV ) );
  reflectedLight.indirectDiffuse += rim * 0.9 * irradiance * mix( material.diffuseColor, vec3( 1.0 ), 0.45 ) * RECIPROCAL_PI;
}
#endif
`;

// Filmic tone mapping keeps highlights soft but greys colours out; push saturation back up after it
const STUB = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
if (!C.tonemapping_pars_fragment.includes(STUB)) throw new Error('toon: three.js tone mapping changed');
C.tonemapping_pars_fragment = C.tonemapping_pars_fragment.replace(STUB, `
vec3 CustomToneMapping( vec3 color ) {
  color = ACESFilmicToneMapping( color );
  float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  return saturate( mix( vec3( l ), color, 1.22 ) );
}`);

export const TONE = THREE.CustomToneMapping;
