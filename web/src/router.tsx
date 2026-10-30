import { type MouseEvent, type ReactNode, useEffect, useState } from "react";

export type Route =
  | { page: "home" }
  | { page: "join"; key: string }
  | { page: "game"; gameId: string }
  | { page: "profile" }
  | { page: "privacy" }
  | { page: "transfer" }
  | { page: "notFound" };

export function parseRoute(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [first, second] = parts;
  if (parts.length === 0) return { page: "home" };
  if (first === "join" && parts.length <= 2) return { page: "join", key: second ?? "" };
  if (first === "game" && second && parts.length === 2) return { page: "game", gameId: second };
  if (first === "profile" && parts.length === 1) return { page: "profile" };
  if (first === "privacy" && parts.length === 1) return { page: "privacy" };
  if (first === "transfer" && parts.length === 1) return { page: "transfer" };
  return { page: "notFound" };
}

const listeners = new Set<() => void>();

export function navigate(path: string, { replace = false } = {}): void {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  window.scrollTo(0, 0);
  for (const listener of listeners) listener();
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.pathname));
  useEffect(() => {
    const update = () => setRoute(parseRoute(location.pathname));
    listeners.add(update);
    window.addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return route;
}

/** A link that navigates without reloading the page. */
export function Link({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
