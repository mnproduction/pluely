import { Button } from "@/components";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMenuItems, useVersion } from "@/hooks";

export const Sidebar = () => {
  const { version, isLoading } = useVersion();
  const { menu, footerLinks, footerItems } = useMenuItems();

  const navigate = useNavigate();
  const activeRoute = useLocation().pathname;
  const handleNavigate = (href: string) => () => navigate(href);
  const handleOpenExternal = (link: string) => () => void openUrl(link);
  const isActive = (href: string) =>
    activeRoute === href || activeRoute.startsWith(`${href}/`);

  return (
    <aside className="flex w-56 flex-col select-none pt-2">
      {/* Logo */}
      <button
        type="button"
        onClick={handleNavigate("/dashboard")}
        className="flex h-16 items-center gap-1.5 rounded-xl px-4 pt-10 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Open Mira Desk dashboard"
      >
        <img src="/mira-desk.svg" alt="" className="size-6 lg:size-7 rounded-lg" />
        <div className="flex flex-col">
          <h1 className="text-xs lg:text-md font-semibold text-foreground transition-all duration-300">
            Mira Desk
          </h1>
          <span className="text-[8px] lg:text-[10px] text-muted-foreground -mt-1 block">
            {isLoading ? "Loading..." : `(v${version})`}
          </span>
        </div>
      </button>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-6">
        {menu.map((item, index) => (
          <button
            type="button"
            onClick={handleNavigate(item.href)}
            aria-current={isActive(item.href) ? "page" : undefined}
            key={`${item.label}-${index}`}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs lg:text-sm text-sidebar-foreground/70 transition-all duration-300 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive(item.href)
                ? "font-medium bg-sidebar-accent text-sidebar-accent-foreground"
                : ""
            )}
          >
            <div className="flex items-center gap-3">
              <item.icon className="size-3 lg:size-4 transition-all duration-300" />
              {item.label}
            </div>
            {item.count ? (
              <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="flex flex-col space-y-1 px-3  pb-3">
        <div className="flex flex-row justify-evenly items-center gap-2 mb-3">
          {footerLinks.map((item, index) => (
            <Button
              key={`${item.title}-${index}`}
              title={item.title}
              aria-label={item.title}
              size="sm"
              variant="outline"
              onClick={handleOpenExternal(item.link)}
            >
              <item.icon className="size-3 lg:size-4 transition-all duration-300" />
            </Button>
          ))}
        </div>

        {footerItems.map((item, index) => {
          const handleFooterAction = "action" in item
            ? () => void item.action?.()
            : handleOpenExternal(item.href);
          return (
          <button
            type="button"
            onClick={handleFooterAction}
            key={`${item.label}-${index}`}
            className={cn("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs text-sidebar-foreground/70 transition-all duration-300 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring lg:text-sm")}
          >
            <div className="flex items-center gap-3">
              <item.icon className="size-3 lg:size-4 transition-all duration-300" />
              {item.label}
            </div>
          </button>
          );
        })}
      </div>
    </aside>
  );
};
