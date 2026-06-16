import React, { useState } from 'react';
import { ZoomOut } from 'lucide-react';

export type BodySide = 'front' | 'back';
export type ViewNode = 'main' | 'face' | 'hand-right' | 'hand-left' | 'foot-right' | 'foot-left';

interface BodyComponentProps {
  selectedAreas: string[];
  onToggleArea?: (area: string) => void;
  readonly?: boolean;
}

// Medical/anatomical styling constants matching the PDF
const SKIN_FILL = "#f7ded4"; // Premium warm skin tone as seen in PDF
const HAIR_FILL = "#312217"; // Natural brown-black elegant hair fill
const STROKE_COLOR = "#1e1b18"; // Deep slate outer outlines for a precise vector look
const SELECTED_FILL = "url(#hatchPattern)"; // Diagnostic pink-red hatch fill

export const BodyMap: React.FC<BodyComponentProps> = ({ selectedAreas, onToggleArea, readonly = false }) => {
  const [side, setSide] = useState<BodySide>('front');
  const [viewNode, setViewNode] = useState<ViewNode>('main');

  const toggle = (id: string) => { if (onToggleArea) onToggleArea(id); };
  const handleNav = (node: ViewNode) => { if (!readonly) setViewNode(node); };
  const isSelected = (id: string) => selectedAreas.includes(id);

  // Dynamic ViewBox system to deliver continuous "zooming in" feeling natively in SVG
  const getViewBox = () => {
    switch (viewNode) {
      case 'main': return "0 0 100 260";
      case 'face': return "15 5 70 120";
      case 'hand-right':
      case 'hand-left': return "10 5 80 120";
      case 'foot-right':
      case 'foot-left': return "10 5 80 135";
      default: return "0 0 100 260";
    }
  };

  // Reusable overlay builder with hover highlights & stroke-less merging to achieve smooth skin continuity
  const renderInteractiveOverlay = (id: string, d: string, nav?: ViewNode, options?: { circle?: { cx: number; cy: number; r: number } }) => {
    const selected = isSelected(id);
    return (
      <g
        key={id}
        onClick={(e) => {
          e.stopPropagation();
          if (nav && !readonly) handleNav(nav);
          else toggle(id);
        }}
        className={!readonly ? 'cursor-pointer group outline-none' : 'outline-none'}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        {options?.circle ? (
          <>
            <circle
              cx={options.circle.cx}
              cy={options.circle.cy}
              r={options.circle.r}
              fill={selected ? "rgba(217, 79, 101, 0.3)" : "transparent"}
              stroke={selected ? "#d94f65" : "rgba(217, 79, 101, 0.4)"}
              strokeWidth="1.2"
              className="transition-all duration-200 group-hover:scale-120 origin-center"
            />
            {selected && (
              <circle
                cx={options.circle.cx}
                cy={options.circle.cy}
                r={options.circle.r - 1}
                fill={SELECTED_FILL}
              />
            )}
          </>
        ) : (
          <path
            d={d}
            fill={selected ? SELECTED_FILL : "transparent"}
            stroke={selected ? "rgba(217, 79, 101, 0.6)" : "transparent"}
            strokeWidth="1.2"
            className="transition-all duration-200 group-hover:fill-[#d94f65]/15"
          />
        )}
      </g>
    );
  };

  const FrontBody = () => (
    <g>
      {/* 1. Master Skin Silhouette Layer to maintain perfect 100% skin continuity */}
      <path
        d="M 45 32 C 41 32, 33 39, 31 43 C 29 46, 18 78, 16 84 C 14 90, 11 114, 11 118 C 11 122, 13 130, 16 134 C 19 138, 22 136, 22 130 C 22 124, 25 116, 27 100 C 29 88, 34 68, 35 60 C 36 72, 36 84, 36 94 C 36 102, 34 108, 34 112 C 34 140, 35 160, 37 174 C 39 188, 39 210, 37 232 C 36 238, 34 242, 34 246 C 34 248, 44 248, 44 246 C 44 242, 46 238, 46 232 C 46 210, 46 188, 48 174 C 49 160, 50 140, 50 114 C 50 140, 51 160, 52 174 C 54 188, 54 210, 54 232 C 54 238, 56 242, 56 246 C 56 248, 66 248, 66 246 C 66 242, 64 238, 63 232 C 61 210, 61 188, 63 174 C 65 160, 66 140, 66 112 C 66 102, 64 94, 64 84 C 64 72, 65 60, 65 60 C 66 68, 71 88, 73 100 C 75 116, 78 124, 78 130 C 78 136, 81 138, 84 134 C 87 130, 89 122, 89 118 C 89 114, 86 90, 84 84 C 82 78, 72 49, 70 43 C 67 39, 59 32, 55 32 Z"
        fill={SKIN_FILL}
        stroke={STROKE_COLOR}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      {/* Head & Neck Base Outline */}
      <path
        d="M 50 32 C 45 32, 42 28, 42 22 C 42 12, 45 9, 50 9 C 55 9, 58 12, 58 22 C 58 28, 55 32, 50 32 Z"
        fill={SKIN_FILL}
        stroke={STROKE_COLOR}
        strokeWidth="1.8"
      />
      
      {/* Ears Layout */}
      <path d="M 58 19 C 60 19, 61 22, 58 24 Z" fill={SKIN_FILL} stroke={STROKE_COLOR} strokeWidth="1.2" />
      <path d="M 42 19 C 40 19, 39 22, 42 24 Z" fill={SKIN_FILL} stroke={STROKE_COLOR} strokeWidth="1.2" />
      
      {/* Aesthetic Hair Line */}
      <path
        d="M 42 18 C 43 14, 46 12, 50 12 C 54 12, 57 14, 58 18 C 55 16, 45 16, 42 18 Z"
        fill={HAIR_FILL}
        stroke={STROKE_COLOR}
        strokeWidth="1"
      />

      {/* 2. Realistic subtle human contour detail lines with light opacity ink */}
      <g stroke={STROKE_COLOR} strokeWidth="1" fill="none" opacity="0.35" pointerEvents="none">
        {/* Face details */}
        <path d="M 47 21 Q 48 20 49 21" strokeWidth="1.5" />
        <path d="M 53 21 Q 52 20 51 21" strokeWidth="1.5" />
        <path d="M 48 24 A 0.5 0.5 0 1 1 47 24" />
        <path d="M 53 24 A 0.5 0.5 0 1 1 52 24" />
        <path d="M 50 25 L 50 27" />
        <path d="M 48 29 Q 50 30.5 52 29" />
        
        {/* Collar/Clavicles */}
        <path d="M 33 44 Q 41 46 48 41" />
        <path d="M 67 44 Q 59 46 52 41" />
        {/* Chest muscular bounds (Nipples removed!) */}
        <path d="M 36 68 C 43 70, 50 70, 50 70 C 50 70, 57 70, 64 68" />
        {/* Abdomen groin contour lines */}
        <path d="M 50 70 L 50 100" />
        <circle cx="50" cy="91" r="1" /> {/* Navel */}
        <path d="M 34 108 Q 42 110 50 112" />
        <path d="M 66 108 Q 58 110 50 112" />
        {/* Knee caps */}
        <path d="M 35 174 Q 40 171 45 174" />
        <path d="M 35 178 Q 40 181 45 178" />
        <path d="M 55 174 Q 60 171 65 174" />
        <path d="M 55 178 Q 60 181 65 178" />

        {/* Beautiful distinct separation lines for Neck and Paws/extremities */}
        {/* Neck outlines */}
        <path d="M 42 32 C 45 33, 55 33, 58 32" strokeWidth="1.2" />
        <path d="M 41 40 Q 50 42 59 40" strokeWidth="1.2" />

        {/* Hand/paw outlines */}
        <path d="M 13 114 C 16 115, 19 115, 21 114" strokeWidth="1.2" />
        <path d="M 87 114 C 84 115, 81 115, 79 114" strokeWidth="1.2" />
        {/* Right Hand fingers detail */}
        <path d="M 15 120 L 15 129" />
        <path d="M 18 120 L 18 131" />
        <path d="M 21 119 L 21 126" />
        {/* Left Hand fingers detail */}
        <path d="M 85 120 L 85 129" />
        <path d="M 82 120 L 82 131" />
        <path d="M 79 119 L 79 126" />

        {/* Foot/toe outlines */}
        <path d="M 31 230 Q 37 231 44 230" strokeWidth="1.2" />
        <path d="M 69 230 Q 63 231 56 230" strokeWidth="1.2" />
        {/* Right Foot toes */}
        <path d="M 34 238 L 34 245" />
        <path d="M 37 238 L 37 246" />
        <path d="M 40 238 L 40 244" />
        {/* Left Foot toes */}
        <path d="M 66 238 L 66 245" />
        <path d="M 63 238 L 63 246" />
        <path d="M 60 238 L 60 244" />

        {/* Core anatomical segmentation curves to make all regions visual map perfect */}
        <path d="M 31 43 C 33 46, 35 50, 35 56" />
        <path d="M 69 43 C 67 46, 65 50, 65 56" />
        <path d="M 36 68 Q 50 71 64 68" />
        <path d="M 36 98 Q 50 95 64 98" />
        <path d="M 36 98 L 50 114" />
        <path d="M 64 98 L 50 114" />
        <path d="M 18 78 Q 22 79 26 80" />
        <path d="M 82 78 Q 78 79 74 80" />
        <path d="M 33 168 Q 40 168 47 168" />
        <path d="M 67 168 Q 60 168 53 168" />
      </g>

      {/* 3. Invisible segments for high-fidelity interactive map clicks (No ugly border puzzle lines!) */}
      {renderInteractiveOverlay('Front Forehead', 'M 42 9 C 42 9, 39 18, 42 22 L 58 22 C 61 18, 58 9, 58 9 Z', 'face')}
      {renderInteractiveOverlay('Front Right Ear', 'M 42 19 C 40 19, 39 22, 42 24 Z', 'face')}
      {renderInteractiveOverlay('Front Left Ear', 'M 58 19 C 60 19, 61 22, 58 24 Z', 'face')}
      {renderInteractiveOverlay('Front Neck', 'M 42 32 L 58 32 L 59 40 L 41 40 Z')}
      {renderInteractiveOverlay('Front Chest', 'M 36 40 L 64 40 L 63 68 C 55 70, 45 70, 37 68 Z')}
      {renderInteractiveOverlay('Front Abdomen', 'M 37 68 C 45 70, 55 70, 63 68 L 64 98 L 36 98 Z')}
      {renderInteractiveOverlay('Front Genital', 'M 36 98 L 64 98 L 50 114 Z')}

      {/* Arms & Shoulders */}
      {renderInteractiveOverlay('Front Right Shoulder', 'M 31 43 C 32 40, 36 40, 38 42 L 35 56 C 31 52, 29 48, 31 43 Z')}
      {renderInteractiveOverlay('Front Right Upper Arm', 'M 31 43 L 18 78 L 26 80 L 35 56 Z')}
      {renderInteractiveOverlay('Front Right Forearm', 'M 18 78 L 13 114 L 21 114 L 26 80 Z')}
      {renderInteractiveOverlay('Front Right Hand', 'M 13 114 C 11 118, 11 122, 13 128 C 16 132, 18 132, 21 128 C 22 122, 22 118, 21 114 Z', 'hand-right')}

      {renderInteractiveOverlay('Front Left Shoulder', 'M 69 43 C 68 40, 64 40, 62 42 L 65 56 C 69 52, 71 48, 69 43 Z')}
      {renderInteractiveOverlay('Front Left Upper Arm', 'M 69 43 L 82 78 L 74 80 L 65 56 Z')}
      {renderInteractiveOverlay('Front Left Forearm', 'M 82 78 L 87 114 L 79 114 L 74 80 Z')}
      {renderInteractiveOverlay('Front Left Hand', 'M 87 114 C 89 118, 89 122, 87 128 C 84 132, 82 132, 79 128 C 78 122, 78 118, 79 114 Z', 'hand-left')}

      {/* Legs & Feet (Separate lower leg clicking from paw navigation as requested!) */}
      {renderInteractiveOverlay('Front Right Thigh', 'M 36 98 L 50 114 L 47 168 L 33 168 Z')}
      {renderInteractiveOverlay('Front Right Lower Leg', 'M 33 168 L 47 168 L 44 230 L 31 230 Z')}
      {renderInteractiveOverlay('Front Right Foot', 'M 31 230 L 44 230 C 45 235, 45 240, 42 245 C 38 245, 34 245, 31 238 Z', 'foot-right')}

      {renderInteractiveOverlay('Front Left Thigh', 'M 64 98 L 50 114 L 53 168 L 67 168 Z')}
      {renderInteractiveOverlay('Front Left Lower Leg', 'M 67 168 L 53 168 L 56 230 L 69 230 Z')}
      {renderInteractiveOverlay('Front Left Foot', 'M 69 230 L 56 230 C 55 235, 55 240, 58 245 C 62 245, 66 245, 69 238 Z', 'foot-left')}
    </g>
  );

  const BackBody = () => (
    <g>
      {/* 1. Silhouette Layer Front/Back symmetry */}
      <path
        d="M 45 32 C 41 32, 33 39, 31 43 C 29 46, 18 78, 16 84 C 14 90, 11 114, 11 118 C 11 122, 13 130, 16 134 C 19 138, 22 136, 22 130 C 22 124, 25 116, 27 100 C 29 88, 34 68, 35 60 C 36 72, 36 84, 36 94 C 36 102, 34 108, 34 112 C 34 140, 35 160, 37 174 C 39 188, 39 210, 37 232 C 36 238, 34 242, 34 246 C 34 248, 44 248, 44 246 C 44 242, 46 238, 46 232 C 46 210, 46 188, 48 174 C 49 160, 50 140, 50 114 C 50 140, 51 160, 52 174 C 54 188, 54 210, 54 232 C 54 238, 56 242, 56 246 C 56 248, 66 248, 66 246 C 66 242, 64 238, 63 232 C 61 210, 61 188, 63 174 C 65 160, 66 140, 66 112 C 66 102, 64 94, 64 84 C 64 72, 65 60, 65 60 C 66 68, 71 88, 73 100 C 75 116, 78 124, 78 130 C 78 136, 81 138, 84 134 C 87 130, 89 122, 89 118 C 89 114, 86 90, 84 84 C 82 78, 72 49, 70 43 C 67 39, 59 32, 55 32 Z"
        fill={SKIN_FILL}
        stroke={STROKE_COLOR}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      {/* Head Outline representing beautiful dark brown hair cover */}
      <path
        d="M 50 32 C 45 32, 42 28, 42 22 C 42 12, 45 9, 50 9 C 55 9, 58 12, 58 22 C 58 28, 55 32, 50 32 Z"
        fill={SKIN_FILL}
        stroke={STROKE_COLOR}
        strokeWidth="1.8"
      />
      
      {/* Elegant Back hair representing Page 2 */}
      <path
        d="M 42 22 C 41 12, 45 9, 50 9 C 55 9, 59 12, 58 22 C 58 26, 55 28, 50 28 C 45 28, 42 26, 42 22 Z"
        fill={HAIR_FILL}
        stroke={STROKE_COLOR}
        strokeWidth="1.2"
      />

      {/* Anatomical crease shadows for Back view */}
      <g stroke={STROKE_COLOR} strokeWidth="1" fill="none" opacity="0.35" pointerEvents="none">
        <path d="M 48 60 Q 50 56 52 60" />
        <path d="M 44 75 Q 50 78 56 75" />
        {/* Spine line */}
        <path d="M 50 45 L 50 90" />
        {/* Buttock curves */}
        <path d="M 50 102 C 44 102, 38 107, 36 114" />
        <path d="M 50 102 C 56 102, 62 107, 64 114" />

        {/* Beautiful distinct separation lines for Neck and Paws/extremities on Back */}
        {/* Neck outlines */}
        <path d="M 42 32 C 45 33, 55 33, 58 32" strokeWidth="1.2" />
        <path d="M 41 40 Q 50 42 59 40" strokeWidth="1.2" />

        {/* Hand/paw outlines */}
        <path d="M 13 114 C 16 115, 19 115, 21 114" strokeWidth="1.2" />
        <path d="M 87 114 C 84 115, 81 115, 79 114" strokeWidth="1.2" />
        {/* Left Hand fingers detail (swapped on back view) */}
        <path d="M 15 120 L 15 129" />
        <path d="M 18 120 L 18 131" />
        <path d="M 21 119 L 21 126" />
        {/* Right Hand fingers detail (swapped on back view) */}
        <path d="M 85 120 L 85 129" />
        <path d="M 82 120 L 82 131" />
        <path d="M 79 119 L 79 126" />

        {/* Foot/toe outlines */}
        <path d="M 31 230 Q 37 231 44 230" strokeWidth="1.2" />
        <path d="M 69 230 Q 63 231 56 230" strokeWidth="1.2" />
        {/* Left Foot toes */}
        <path d="M 34 238 L 34 245" />
        <path d="M 37 238 L 37 246" />
        <path d="M 40 238 L 40 244" />
        {/* Right Foot toes */}
        <path d="M 66 238 L 66 245" />
        <path d="M 63 238 L 63 246" />
        <path d="M 60 238 L 60 244" />

        {/* Core anatomical segmentation curves to make all regions visual map perfect on Back */}
        <path d="M 31 43 C 33 46, 35 50, 35 56" />
        <path d="M 69 43 C 67 46, 65 50, 65 56" />
        <path d="M 37 65 Q 50 67 63 65" />
        <path d="M 36 96 Q 50 94 64 96" />
        <path d="M 36 114 C 38 114, 44 114, 50 114" />
        <path d="M 64 114 C 62 114, 56 114, 50 114" />
        <path d="M 18 78 Q 22 79 26 80" />
        <path d="M 82 78 Q 78 79 74 80" />
        <path d="M 33 168 Q 40 168 47 168" />
        <path d="M 67 168 Q 60 168 53 168" />
      </g>

      {/* Overlays */}
      {renderInteractiveOverlay('Back of Head', 'M 42 9 C 42 9, 39 18, 42 22 L 58 22 C 61 18, 58 9, 58 9 Z', 'face')}
      {renderInteractiveOverlay('Back Neck', 'M 42 32 L 58 32 L 59 40 L 41 40 Z')}
      {renderInteractiveOverlay('Back Upper Back', 'M 41 40 L 59 40 L 63 65 L 37 65 Z')}
      {renderInteractiveOverlay('Back Lower Back', 'M 37 65 L 63 65 L 64 96 L 36 96 Z')}
      {renderInteractiveOverlay('Back Buttock', 'M 36 96 L 64 96 C 64 106, 62 114, 50 114 C 38 114, 36 106, 36 96 Z')}

      {/* Arm Back parts */}
      {renderInteractiveOverlay('Back Left Shoulder', 'M 31 43 C 32 40, 36 40, 38 42 L 35 56 C 31 52, 29 48, 31 43 Z')}
      {renderInteractiveOverlay('Back Left Upper Arm', 'M 31 43 L 18 78 L 26 80 L 35 56 Z')}
      {renderInteractiveOverlay('Back Left Forearm', 'M 18 78 L 13 114 L 21 114 L 26 80 Z')}
      {renderInteractiveOverlay('Back Left Hand', 'M 13 114 C 11 118, 11 122, 13 128 C 16 132, 18 132, 21 128 C 22 122, 22 118, 21 114 Z', 'hand-left')}

      {renderInteractiveOverlay('Back Right Shoulder', 'M 69 43 C 68 40, 64 40, 62 42 L 65 56 C 69 52, 71 48, 69 43 Z')}
      {renderInteractiveOverlay('Back Right Upper Arm', 'M 69 43 L 82 78 L 74 80 L 65 56 Z')}
      {renderInteractiveOverlay('Back Right Forearm', 'M 82 78 L 87 114 L 79 114 L 74 80 Z')}
      {renderInteractiveOverlay('Back Right Hand', 'M 87 114 C 89 118, 89 122, 87 128 C 84 132, 82 132, 79 128 C 78 122, 78 118, 79 114 Z', 'hand-right')}

      {/* Legs Back parts */}
      {renderInteractiveOverlay('Back Left Thigh', 'M 36 114 L 50 114 L 47 168 L 33 168 Z')}
      {renderInteractiveOverlay('Back Left Lower Leg', 'M 33 168 L 47 168 L 44 230 L 31 230 Z')}
      {renderInteractiveOverlay('Back Left Foot', 'M 31 230 L 44 230 C 45 235, 45 240, 42 245 C 38 245, 34 245, 31 238 Z', 'foot-left')}

      {renderInteractiveOverlay('Back Right Thigh', 'M 64 114 L 50 114 L 53 168 L 67 168 Z')}
      {renderInteractiveOverlay('Back Right Lower Leg', 'M 67 168 L 53 168 L 56 230 L 69 230 Z')}
      {renderInteractiveOverlay('Back Right Foot', 'M 69 230 L 56 230 C 55 235, 55 240, 58 245 C 62 245, 66 245, 69 238 Z', 'foot-right')}
    </g>
  );

  const FaceView = () => {
    if (side === 'back') {
      return (
        <g>
          {/* Back of Head close up */}
          {/* 1. Master Skin Container for Back Head */}
          <path
            d="M 22 55 C 22 30, 30 18, 50 18 C 70 18, 78 30, 78 55 C 78 85, 70 105, 50 105 C 30 105, 22 85, 22 55 Z"
            fill={SKIN_FILL}
            stroke={STROKE_COLOR}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          {/* Left Ear */}
          <path d="M 78 48 C 84 45, 86 62, 78 68 Z" fill={SKIN_FILL} stroke={STROKE_COLOR} strokeWidth="1.8" />
          {/* Right Ear */}
          <path d="M 22 48 C 16 45, 14 62, 22 68 Z" fill={SKIN_FILL} stroke={STROKE_COLOR} strokeWidth="1.8" />

          {/* Full Hair Cover representing back of head */}
          <path
            d="M 22 55 C 22 30, 30 18, 50 18 C 70 18, 78 30, 78 55 C 78 72, 72 82, 50 82 C 28 82, 22 72, 22 55 Z"
            fill={HAIR_FILL}
            stroke={STROKE_COLOR}
            strokeWidth="1.5"
          />

          {/* Back of Neck background */}
          <path
            d="M 32 102 C 32 115, 30 120, 22 125 L 78 125 C 70 120, 68 115, 68 102 Z"
            fill={SKIN_FILL}
            stroke={STROKE_COLOR}
            strokeWidth="1.8"
            pointerEvents="none"
          />

          {/* Hair flow lines */}
          <g fill="none" stroke={STROKE_COLOR} strokeWidth="1" opacity="0.25" pointerEvents="none">
            <path d="M 50 18 L 50 80" />
            <path d="M 40 22 Q 45 50 45 80" />
            <path d="M 60 22 Q 55 50 55 80" />
          </g>

          {/* 2. Interactive Overlays for Back Head */}
          {renderInteractiveOverlay('Back of Head', 'M 22 55 C 22 30, 30 18, 50 18 C 70 18, 78 30, 78 55 C 78 72, 72 82, 50 82 C 28 82, 22 72, 22 55 Z')}
          {renderInteractiveOverlay('Back Right Ear', 'M 22 48 C 16 45, 14 62, 22 68 Z')}
          {renderInteractiveOverlay('Back Left Ear', 'M 78 48 C 84 45, 86 62, 78 68 Z')}
          {renderInteractiveOverlay('Back Neck', 'M 32 102 C 32 115, 30 120, 22 125 L 78 125 C 70 120, 68 115, 68 102 Z')}
        </g>
      );
    }

    return (
      <g>
        {/* 1. Seamless Face Close-Up Master Skin Container */}
        <path
          d="M 22 55 C 22 30, 30 18, 50 18 C 70 18, 78 30, 78 55 C 78 85, 70 105, 50 105 C 30 105, 22 85, 22 55 Z"
          fill={SKIN_FILL}
          stroke={STROKE_COLOR}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        {/* Left Ear */}
        <path d="M 78 48 C 84 45, 86 62, 78 68 Z" fill={SKIN_FILL} stroke={STROKE_COLOR} strokeWidth="1.8" />
        {/* Right Ear */}
        <path d="M 22 48 C 16 45, 14 62, 22 68 Z" fill={SKIN_FILL} stroke={STROKE_COLOR} strokeWidth="1.8" />

        {/* Seamless Hairline */}
        <path
          d="M 22 44 C 23 28, 30 18, 50 18 C 70 18, 77 28, 78 44 C 74 32, 65 24, 50 26 C 35 28, 26 34, 22 44 Z"
          fill={HAIR_FILL}
          stroke={STROKE_COLOR}
          strokeWidth="1.5"
        />

        {/* Anatomical features drawn on top with 0 pointer events to let them draw seamlessly */}
        <g fill="none" stroke={STROKE_COLOR} strokeWidth="1.5" strokeLinecap="round" pointerEvents="none">
          {/* Eyebrows matching premium human look */}
          <path d="M 33 46 Q 39 42 45 46" strokeWidth="2.5" />
          <path d="M 67 46 Q 61 42 55 46" strokeWidth="2.5" />
          {/* Beautiful eyes with lids & dark blue/slate pupils */}
          <path d="M 32 54 Q 38 52 44 54" />
          <circle cx="38" cy="55" r="2" fill={STROKE_COLOR} />
          <path d="M 68 54 Q 62 52 56 54" />
          <circle cx="62" cy="55" r="2" fill={STROKE_COLOR} />
          {/* Nose bridge and base */}
          <path d="M 48 54 L 48 72" opacity="0.6" />
          <path d="M 45 74 Q 50 78 55 74" />
          {/* Smiling Mouth and chin crease */}
          <path d="M 40 86 Q 50 92 60 86" />
          <path d="M 45 92 Q 50 95 55 92" opacity="0.5" />
        </g>

        {/* Beautiful Neck background */}
        <path
          d="M 32 102 C 32 115, 30 120, 22 125 L 78 125 C 70 120, 68 115, 68 102 Z"
          fill={SKIN_FILL}
          stroke={STROKE_COLOR}
          strokeWidth="1.8"
          pointerEvents="none"
        />

        {/* 2. Invisible overlay segments for Face parts (Selected: pink diagonal hatch, unselected: transparent & continuous!) */}
        {renderInteractiveOverlay('Front Forehead', 'M 24 45 C 24 25, 30 20, 50 20 C 70 20, 76 25, 76 45 L 75 50 C 60 52, 40 52, 25 50 Z')}
        {renderInteractiveOverlay('Front Right Cheek', 'M 22 52 C 22 52, 33 54, 45 56 C 45 74, 45 84, 45 84 L 32 100 C 24 88, 22 72, 22 52 Z')}
        {renderInteractiveOverlay('Front Left Cheek', 'M 78 52 C 78 52, 67 54, 55 56 C 55 74, 55 84, 55 84 L 68 100 C 76 88, 78 72, 78 52 Z')}
        {renderInteractiveOverlay('Front Nose Area', 'M 45 48 L 55 48 L 55 84 L 45 84 Z')}
        {renderInteractiveOverlay('Front Chin', 'M 32 100 Q 50 92 68 100 C 65 106, 58 112, 50 112 C 42 112, 35 106, 32 100 Z')}
        {renderInteractiveOverlay('Front Right Ear', 'M 22 48 C 16 45, 14 62, 22 68 Z')}
        {renderInteractiveOverlay('Front Left Ear', 'M 78 48 C 84 45, 86 62, 78 68 Z')}
        {renderInteractiveOverlay('Front Neck', 'M 32 102 C 32 115, 30 120, 22 125 L 78 125 C 70 120, 68 115, 68 102 Z')}
      </g>
    );
  };

  const HandView = () => {
    const isRight = viewNode === 'hand-right';
    const sideName = isRight ? 'Right' : 'Left';
    const isFront = side === 'front';
    const prefix = isFront ? 'Front' : 'Back';
    const fingerPrefix = `${prefix} ${sideName} `;

    // Auto mirror coordinates ifLeft hand to keep rendering super modular
    const transformX = isRight ? "translate(0, 0)" : "translate(100, 0) scale(-1, 1)";

    return (
      <g transform={transformX}>
        {/* Whole Master Hand Silhouette */}
        <path
          d="M 38 115 C 34 110, 31 100, 31 90 C 29 82, 18 78, 14 68 C 10 58, 16 52, 22 56 C 28 60, 33 68, 35 72 C 34 50, 34 25, 34 15 C 34 8, 42 8, 42 15 C 42 45, 43 65, 43 68 C 43 45, 44 20, 44 10 C 44 3, 52 3, 52 10 C 52 45, 53 65, 53 68 C 53 45, 54 20, 54 15 C 54 8, 62 8, 62 15 C 62 45, 63 65, 63 68 C 63 50, 64 30, 64 25 C 64 18, 72 18, 72 25 C 72 55, 71 85, 68 95 C 66 102, 64 110, 60 115 Z"
          fill={SKIN_FILL}
          stroke={STROKE_COLOR}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />

        {/* Delicate hand skin crease lines */}
        <g stroke={STROKE_COLOR} strokeWidth="1" fill="none" opacity="0.25" pointerEvents="none">
          {isFront ? (
            <>
              {/* Palm crease lines */}
              <path d="M 35 78 C 46 84, 58 84, 66 74" />
              <path d="M 38 88 C 48 98, 58 92, 63 82" />
            </>
          ) : (
            <>
              {/* Back hand knuckles */}
              <circle cx="38" cy="70" r="1" />
              <circle cx="48" cy="68" r="1" />
              <circle cx="58" cy="70" r="1" />
              <circle cx="68" cy="74" r="1" />
            </>
          )}
        </g>

        {/* Clickable overlayers for Fingers and Base */}
        {renderInteractiveOverlay(`${fingerPrefix}Thumb`, 'M 31 90 C 29 82, 18 78, 14 68 C 10 58, 16 52, 22 56 C 28 60, 33 68, 35 72 Z')}
        {renderInteractiveOverlay(`${fingerPrefix}Index Finger`, 'M 34 72 L 34 15 C 34 8, 42 8, 42 15 L 42 70 Z')}
        {renderInteractiveOverlay(`${fingerPrefix}Middle Finger`, 'M 43 68 L 44 10 C 44 3, 52 3, 52 10 L 52 68 Z')}
        {renderInteractiveOverlay(`${fingerPrefix}Ring Finger`, 'M 53 68 L 54 15 C 54 8, 62 8, 62 15 L 62 68 Z')}
        {renderInteractiveOverlay(`${fingerPrefix}Little Finger`, 'M 63 68 L 64 25 C 64 18, 72 18, 72 25 L 71 85 Z')}
        {renderInteractiveOverlay(`${prefix} ${sideName} Hand`, 'M 38 115 C 34 110, 31 100, 31 90 L 35 72 L 63 68 L 68 95 C 66 102, 64 110, 60 115 Z')}

        {/* Small circular web targets exactly mirroring Page 3 of PDF */}
        {renderInteractiveOverlay(`${fingerPrefix}Finger Web Space`, '', undefined, { circle: { cx: 31, cy: 76, r: 4 } })}
        {renderInteractiveOverlay(`${fingerPrefix}Finger Web Space`, '', undefined, { circle: { cx: 42.5, cy: 69, r: 3.5 } })}
        {renderInteractiveOverlay(`${fingerPrefix}Finger Web Space`, '', undefined, { circle: { cx: 52.5, cy: 69, r: 3.5 } })}
        {renderInteractiveOverlay(`${fingerPrefix}Finger Web Space`, '', undefined, { circle: { cx: 62.5, cy: 71, r: 3.5 } })}
      </g>
    );
  };

  const FootView = () => {
    const isRight = viewNode === 'foot-right';
    const sideName = isRight ? 'Right' : 'Left';
    const isTop = side === 'front';
    const prefix = isTop ? 'Front' : 'Back';
    const toePrefix = `${prefix} ${sideName} `;

    const transformX = isRight ? "translate(0, 0)" : "translate(100, 0) scale(-1, 1)";

    return (
      <g transform={transformX}>
        {/* Foot Outline Master Silhouette */}
        <path
          d="M 44 130 C 41 125, 34 115, 33 95 C 32 75, 29 55, 32 45 C 32 45, 30 40, 30 35 C 30 20, 42 20, 42 35 L 42 45 C 42 45, 43 40, 44 38 C 44 25, 52 25, 52 38 L 52 45 C 52 45, 53 40, 54 40 C 54 28, 61 28, 61 40 L 61 45 C 61 45, 62 41, 63 41 C 63 32, 69 32, 69 41 L 69 45 C 69 45, 70 42, 71 42 C 71 35, 77 35, 77 42 C 77 55, 74 75, 73 95 C 72 115, 65 125, 62 130 Z"
          fill={SKIN_FILL}
          stroke={STROKE_COLOR}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />

        {/* Aesthetic Toe-nail / Sole line drawings */}
        <g stroke={STROKE_COLOR} strokeWidth="1" fill="none" opacity="0.25" pointerEvents="none">
          {isTop ? (
            <>
              {/* Toe nails representation */}
              <path d="M 33 26 C 34 22, 38 22, 39 26 Q 36 29, 33 26 Z" />
              <path d="M 46 29 C 47 26, 49 26, 50 29 Q 48 31, 46 29 Z" />
              <path d="M 56 31 C 57 29, 58 29, 59 31" />
              <path d="M 65 33 C 66 31, 67 31, 68 33" />
              <path d="M 73 35 Q 74 33, 75 35" />
            </>
          ) : (
            <>
              {/* Foot sole arcs */}
              <path d="M 38 75 Q 48 85, 68 70" />
              <path d="M 40 95 Q 46 100, 65 92" />
            </>
          )}
        </g>

        {/* Selected overlays */}
        {renderInteractiveOverlay(`${toePrefix}Big Toe`, 'M 30 45 C 30 20, 42 20, 42 35 L 42 45 Z')}
        {renderInteractiveOverlay(`${toePrefix}Second Toe`, 'M 44 45 C 44 25, 52 25, 52 38 L 52 45 Z')}
        {renderInteractiveOverlay(`${toePrefix}Third Toe`, 'M 54 45 C 54 28, 61 28, 61 40 L 61 45 Z')}
        {renderInteractiveOverlay(`${toePrefix}Fourth Toe`, 'M 63 45 C 63 32, 69 32, 69 41 L 69 45 Z')}
        {renderInteractiveOverlay(`${toePrefix}Little Toe`, 'M 71 45 C 71 35, 77 35, 77 42 L 77 45 Z')}
        {renderInteractiveOverlay(`${prefix} ${sideName} Foot`, 'M 44 130 C 41 125, 34 115, 33 95 C 32 75, 29 55, 32 45 L 75 45 C 75 45, 74 75, 73 95 C 72 115, 65 125, 62 130 Z')}
      </g>
    );
  };

  return (
    <div className="relative flex flex-col items-center w-full min-h-[460px] mx-auto select-none mt-2">
      
      {/* Zoom Link back button */}
      <div className="absolute top-4 left-4 z-20">
        {viewNode !== 'main' && (
          <button
            onClick={() => setViewNode('main')}
            className="px-4 py-2.5 bg-white border border-stone-200 text-stone-700 font-semibold uppercase tracking-widest text-[10px] flex items-center gap-1.5 hover:bg-stone-50 transition-all rounded-xl shadow-lg"
          >
            <ZoomOut size={13} /> Back to Map
          </button>
        )}
      </div>

      {/* FRONT / BACK Pill Toggle Bar - Exactly matching the PDF mockup */}
      <div className="absolute bottom-4 z-20 flex bg-white rounded-full p-1 border border-stone-200 shadow-xl self-center max-w-[200px]">
        <button
          type="button"
          onClick={() => setSide('front')}
          className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 ${
            side === 'front' ? 'bg-[#d94f65] text-white shadow-lg shadow-rose-500/20' : 'text-stone-400 hover:text-stone-800'
          }`}
        >
          {viewNode.includes('foot') ? 'Top' : viewNode.includes('hand') ? 'Palm' : 'Front'}
        </button>
        <button
          type="button"
          onClick={() => setSide('back')}
          className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 ${
            side === 'back' ? 'bg-[#d94f65] text-white shadow-lg shadow-rose-500/20' : 'text-stone-400 hover:text-stone-800'
          }`}
        >
          {viewNode.includes('foot') ? 'Bottom' : viewNode.includes('hand') ? 'Back' : 'Back'}
        </button>
      </div>
      
      {/* Fully-integrated Vector Map Stage */}
      <div className="w-full flex justify-center bg-[#f8f9fa] rounded-3xl border border-stone-200 shadow-inner overflow-hidden absolute inset-0">
        <svg viewBox={getViewBox()} className="w-full h-full p-4 block transition-all duration-500 ease-out">
          <defs>
            <pattern id="hatchPattern" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="#fbe8e9" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#d94f65" strokeWidth="1.8" opacity="0.85" />
            </pattern>
          </defs>

          {viewNode === 'main' && (side === 'front' ? <FrontBody /> : <BackBody />)}
          {viewNode === 'face' && <FaceView />}
          {(viewNode === 'hand-left' || viewNode === 'hand-right') && <HandView />}
          {(viewNode === 'foot-left' || viewNode === 'foot-right') && <FootView />}
        </svg>
      </div>
    </div>
  );
};
