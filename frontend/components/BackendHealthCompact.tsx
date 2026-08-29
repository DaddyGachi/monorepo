"use client";

import { useEffect, useState } from "react";
import { useFeatureFlag } from "@/lib/featureFlags";
import { CheckCircle2, XCircle, Server, Loader2, X } from "lucide-react";
import { getHealth, HealthResponse } from "@/lib/config";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

type State =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "success"; data: HealthResponse };

export default function BackendHealthCompact() {
  const isHealthIndicatorEnabled = useFeatureFlag("BACKEND_HEALTH_INDICATOR_ENABLED");
  // Show in development always, or when the feature flag is explicitly enabled.
  const shouldShow = process.env.NODE_ENV !== "production" || isHealthIndicatorEnabled;
  const [isVisible, setIsVisible] = useState(() => {
    // Check localStorage for user preference
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("backendHealthVisible");
      return saved !== null ? saved === "true" : shouldShow;
    }
    return shouldShow;
  });
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "Not configured";
  const [state, setState] = useState<State>(() => {
    if (!process.env.NEXT_PUBLIC_BACKEND_URL) {
      return { type: "error", message: "NEXT_PUBLIC_BACKEND_URL environment variable is not configured" };
    }
    return { type: "loading" };
  });

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_BACKEND_URL || !shouldShow || !isVisible) {
      return;
    }

    getHealth()
      .then((data) => setState({ type: "success", data }))
      .catch((err: Error) => {
        const errorMessage = err.message || "Unknown error";
        console.error("Backend health check failed:", err);
        setState({ type: "error", message: errorMessage });
      });
  }, [isVisible, shouldShow]);

  const getStatusIcon = () => {
    if (state.type === "loading") {
      return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
    }
    if (state.type === "error") {
      return <XCircle className="h-3 w-3 text-destructive" />;
    }
    return <CheckCircle2 className="h-3 w-3 text-green-600" />;
  };

  const getStatusText = () => {
    if (state.type === "loading") return "Checking...";
    if (state.type === "error") return "Error";
    return state.data.status === "ok" ? "Connected" : "Unhealthy";
  };

  const handleToggle = () => {
    const newVisibility = !isVisible;
    setIsVisible(newVisibility);
    if (typeof window !== "undefined") {
      localStorage.setItem("backendHealthVisible", String(newVisibility));
    }
  };

  const getTooltipContent = () => {
    if (state.type === "loading") {
      return "Checking backend connection...";
    }
    if (state.type === "error") {
      return `Backend Error: ${state.message}`;
    }
    return (
      <div className="space-y-1 text-xs">
        <div><strong>Backend:</strong> {backendUrl}</div>
        <div><strong>Status:</strong> {state.data.status}</div>
        <div><strong>Version:</strong> {state.data.version}</div>
        <div><strong>Uptime:</strong> {state.data.uptimeSeconds}s</div>
        <div className="pt-1 mt-1 border-t border-foreground/20">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Hide indicator
          </button>
        </div>
      </div>
    );
  };

  // Don't render if not in dev mode or explicitly disabled
  if (!shouldShow && !isVisible) {
    return null;
  }

  // If user has hidden it, show a small button to restore it
  if (!isVisible) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggle}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Server className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="text-xs">Show backend health</div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 px-2 py-1 border border-foreground/20 rounded-md bg-muted/50 hover:bg-muted transition-colors cursor-help group">
          <Server className="h-3 w-3 text-muted-foreground" />
          {getStatusIcon()}
          <span className="text-xs font-medium text-muted-foreground">
            {getStatusText()}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity ml-1"
            aria-label="Hide backend health indicator"
          >
            <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        {getTooltipContent()}
      </TooltipContent>
    </Tooltip>
  );
}
