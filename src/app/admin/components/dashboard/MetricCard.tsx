import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  gradient: "blue" | "green" | "gold" | "red-orange" | "navy" | "purple" | "blue-dark";
  change?: string;
  badge?: ReactNode;
  trending?: "up" | "down";
  onClick?: () => void;
}

const gradients = {
  blue: "from-[#00B4DB] to-[#0072FF]",
  green: "from-[#05D35A] to-[#00A83E]",
  gold: "from-[#FFB800] to-[#E59500]",
  "red-orange": "from-[#FF5E36] to-[#E62B2B]",
  navy: "from-[#001A4D] to-[#0E4EBD]",
  purple: "from-[#FF5E36] to-[#E62B2B]", // Replaced purple with reference basis coral red-orange
  "blue-dark": "from-[#001A4D] to-[#0E4EBD]",
};

export function MetricCard({
  title,
  value,
  icon: Icon,
  gradient,
  change,
  badge,
  trending,
  onClick,
}: MetricCardProps) {
  return (
    <div
      onClick={onClick}
      className={`relative bg-gradient-to-br ${gradients[gradient]} rounded-2xl p-6 text-white overflow-hidden shadow-sm ${
        onClick ? "cursor-pointer hover:shadow-lg hover:scale-[1.01] transition-all group" : ""
      }`}
    >
      {/* Decorative ambient subtle circle accents matching basis design */}
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
      <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-white/5 pointer-events-none" />

      {/* Icon Container */}
      <div className="absolute top-6 left-6 w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm group-hover:bg-white/30 transition-colors">
        <Icon className="w-6 h-6" />
      </div>

      {/* Badge or Trending Arrow */}
      <div className="absolute top-6 right-6">
        {badge ? (
          badge
        ) : trending === "up" ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        ) : trending === "down" ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17l5-5m0 0l-5-5m5 5H6" />
          </svg>
        ) : null}
      </div>

      {/* Content */}
      <div className="mt-16">
        <div className="text-4xl sm:text-5xl font-bold mb-2 font-mono tracking-tight">{value}</div>
        <div className="text-white/90 text-sm font-semibold mb-2">{title}</div>
        {change && <div className="text-white/80 text-xs font-medium">{change}</div>}
      </div>
    </div>
  );
}
