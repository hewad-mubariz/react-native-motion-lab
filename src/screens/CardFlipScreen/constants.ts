import { Skia } from "@shopify/react-native-skia";

export const CARD_W = 390;
export const CARD_H = 255;
export const CARD_R = 18;
export const CARD_REFRACTION = 0.035;
export const CARD_SHIMMER = 0.04;
export const CARD_BRAND = "Easy Bank";
export const CARD_NUMBER_MASKED = "4929  ••••  ••••  3847";
export const CARD_NUMBER_FULL = "4929  7512  3412  3847";
export const CARD_NUMBER_NUMERIC_MASKED = "4929  0000  0000  3847";
export const CARD_NUMBER_FONT_FAMILY = "ShareTechMono";

const GLASS_SKSL = `
uniform float u_width;
uniform float u_height;
uniform float u_time;
uniform float u_flip;
uniform float u_front;
uniform float u_refraction;
uniform float u_shimmer;
uniform float u_lightX;
uniform float u_lightY;

float hash(float2 p){ return fract(sin(dot(p,float2(127.1,311.7)))*43758.5); }
float vnoise(float2 p){
  float2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+float2(1,0)),u.x),
             mix(hash(i+float2(0,1)),hash(i+float2(1,1)),u.x),u.y);
}
float fbm(float2 p){
  float v=0.,a=.5;
  for(int i=0;i<5;i++){v+=a*vnoise(p);p=p*2.1+float2(.4,.2);a*=.5;}
  return v;
}
float3 glassNormal(float2 uv,float t){
  float eps=.004;
  float hC=fbm(uv*18.+t*.04);
  float hR=fbm((uv+float2(eps,0.))*18.+t*.04);
  float hU=fbm((uv+float2(0.,eps))*18.+t*.04);
  return normalize(float3((hC-hR)/eps*.55,(hC-hU)/eps*.55,1.0));
}
float3 chromaticSample(float2 uv,float2 offset,float t){
  float r=fbm(uv*6.+offset*1.22+t*.020);
  float g=fbm(uv*6.+offset*0.96+t*.025);
  float b=fbm(uv*6.+offset*0.72+t*.030);
  return float3(r,g,b);
}

half4 main(float2 fragCoord){
  float2 res      = float2(u_width,u_height);
  float2 uv       = fragCoord/res;
  uv.y            = 1.0-uv.y;
  float2 centered = uv*2.0-1.0;

  float3 N          = glassNormal(uv,u_time);
  float2 refrOffset = N.xy * u_refraction * max(u_flip, length(float2(u_lightX,u_lightY))*0.6);
  float3 refracted  = chromaticSample(uv,refrOffset,u_time);

  float3 col;
  if(u_front>0.5){ col=mix(float3(0.10,0.16,0.26),float3(0.04,0.07,0.14),uv.y); }
  else            { col=mix(float3(0.07,0.11,0.19),float3(0.03,0.06,0.11),uv.y); }

  col += refracted * float3(0.006,0.010,0.020)
       * max(u_flip, length(float2(u_lightX,u_lightY))*0.5);

  float angle      = u_flip*3.14159;
  float tiltPhase  = u_lightX*1.8 + u_lightY*1.2;
  float b1=sin(uv.x*9.  +uv.y*4.5+angle*2.2+tiltPhase    +u_time*.30)*.5+.5;
  float b2=sin(uv.x*5.5 -uv.y*7. +angle*3.1-tiltPhase*.7 -u_time*.20)*.5+.5;
  float b3=sin((uv.x+uv.y)*12.   +angle*4.0+tiltPhase*1.3+u_time*.15)*.5+.5;
  float hue=b1*.38+b2*.34+b3*.28+angle*.5;
  float3 holo;
  holo.r=clamp(abs(fract(hue+0.000)*6.0-3.0)-1.0,0.,1.);
  holo.g=clamp(abs(fract(hue+0.333)*6.0-3.0)-1.0,0.,1.);
  holo.b=clamp(abs(fract(hue+0.667)*6.0-3.0)-1.0,0.,1.);

  float tiltMag  = length(float2(u_lightX,u_lightY));
  float shimBase = tiltMag * u_shimmer * 0.85;
  float shimFlip = smoothstep(0.0,0.18,u_flip)*smoothstep(1.0,0.72,u_flip)*u_shimmer;
  float shimmer  = max(shimBase, shimFlip);
  float shimMask = smoothstep(0.9,0.2,length(centered)*0.55);
  col = mix(col, col+holo*shimmer, shimMask);

  float3 lightDir = normalize(float3(
    u_lightX*1.4 + cos(angle+0.8)*0.4,
   -u_lightY*1.4 + 0.55,
    1.2
  ));
  float3 halfV = normalize(lightDir+float3(0,0,1));
  float NdotH  = max(0.,dot(N,halfV));
  float spec   = pow(NdotH,72.0)*1.4;
  float spec2  = pow(NdotH,12.0)*0.28;
  col += (spec+spec2)*float3(0.88,0.94,1.0);

  float fresnel = pow(1.0-abs(centered.x)*0.65,3.5)*0.28
                * max(u_flip, tiltMag*0.6);
  col += fresnel*float3(0.55,0.78,1.0);
  col *= 1.0-length(centered*float2(0.72,0.88))*0.32;
  return half4(col,1.0);
}
`;

export const glassEffect = Skia.RuntimeEffect.Make(GLASS_SKSL);
if (!glassEffect) throw new Error("CardFlip: GLASS_SKSL failed to compile");
