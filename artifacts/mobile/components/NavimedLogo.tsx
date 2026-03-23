import React from "react";
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  G,
  Path,
  Circle,
  Line,
  Text as SvgText,
  ClipPath,
} from "react-native-svg";

interface NavimedLogoProps {
  size?: number;
}

export default function NavimedLogo({ size = 120 }: NavimedLogoProps) {
  return (
    <Svg viewBox="0 0 512 512" width={size} height={size}>
      <Defs>
        <LinearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#0A2540" stopOpacity={1} />
          <Stop offset="100%" stopColor="#0D3B6B" stopOpacity={1} />
        </LinearGradient>
        <LinearGradient id="folderBody" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#1A8FE3" stopOpacity={1} />
          <Stop offset="100%" stopColor="#0B6DBD" stopOpacity={1} />
        </LinearGradient>
        <LinearGradient id="folderTab" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#3BA8F5" stopOpacity={1} />
          <Stop offset="100%" stopColor="#1A8FE3" stopOpacity={1} />
        </LinearGradient>
        <LinearGradient id="docGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="100%" stopColor="#E8F4FD" stopOpacity={1} />
        </LinearGradient>
        <LinearGradient id="crossGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#FF4D6D" stopOpacity={1} />
          <Stop offset="100%" stopColor="#D9001B" stopOpacity={1} />
        </LinearGradient>
        <ClipPath id="appClip">
          <Rect x={0} y={0} width={512} height={512} rx={112} ry={112} />
        </ClipPath>
      </Defs>
      <Rect x={0} y={0} width={512} height={512} rx={112} ry={112} fill="url(#bgGrad)" />
      <G opacity={0.04} clipPath="url(#appClip)">
        <Line x1={0} y1={128} x2={512} y2={128} stroke="white" strokeWidth={1} />
        <Line x1={0} y1={256} x2={512} y2={256} stroke="white" strokeWidth={1} />
        <Line x1={0} y1={384} x2={512} y2={384} stroke="white" strokeWidth={1} />
        <Line x1={128} y1={0} x2={128} y2={512} stroke="white" strokeWidth={1} />
        <Line x1={256} y1={0} x2={256} y2={512} stroke="white" strokeWidth={1} />
        <Line x1={384} y1={0} x2={384} y2={512} stroke="white" strokeWidth={1} />
      </G>
      <G>
        <Path d="M 88 185 Q 88 170 103 170 L 195 170 Q 210 170 218 182 L 233 200 L 88 200 Z" fill="url(#folderTab)" />
        <Rect x={88} y={198} width={336} height={228} rx={18} ry={18} fill="url(#folderBody)" />
        <Rect x={88} y={198} width={336} height={6} rx={3} fill="white" opacity={0.18} />
        <Rect x={148} y={222} width={170} height={188} rx={10} ry={10} fill="url(#docGrad)" />
        <Path d="M 282 222 L 318 222 L 318 258 Z" fill="#C5DCF0" opacity={0.7} />
        <Path d="M 282 222 L 318 258 L 282 258 Z" fill="#E0F0FB" />
        <Rect x={164} y={274} width={100} height={7} rx={3.5} fill="#BDD6EE" />
        <Rect x={164} y={292} width={120} height={7} rx={3.5} fill="#BDD6EE" />
        <Rect x={164} y={310} width={90} height={7} rx={3.5} fill="#BDD6EE" />
        <Rect x={164} y={328} width={110} height={7} rx={3.5} fill="#BDD6EE" />
        <Rect x={164} y={346} width={75} height={7} rx={3.5} fill="#BDD6EE" />
        <Rect x={164} y={376} width={130} height={7} rx={3.5} fill="#BDD6EE" />
        <Circle cx={346} cy={264} r={58} fill="white" />
        <Circle cx={346} cy={264} r={50} fill="url(#crossGrad)" />
        <Rect x={316} y={252} width={60} height={24} rx={6} fill="white" />
        <Rect x={334} y={234} width={24} height={60} rx={6} fill="white" />
      </G>
      <SvgText x={256} y={463} fontFamily="Georgia, serif" fontSize={38} fontWeight="700" letterSpacing={2} textAnchor="middle" fill="white" opacity={0.95}>NaviMED</SvgText>
      <SvgText x={256} y={490} fontFamily="Arial, sans-serif" fontSize={18} fontWeight="400" letterSpacing={8} textAnchor="middle" fill="#1A8FE3" opacity={0.9}>CARNET</SvgText>
      <Line x1={196} y1={497} x2={316} y2={497} stroke="#1A8FE3" strokeWidth={1.5} opacity={0.5} />
    </Svg>
  );
}
