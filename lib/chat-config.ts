let configPromise: Promise<any> | null = null;

/**
 * Singleton function to fetch and cache chat configuration.
 * Prevents multiple redundant API calls to /api/chat/config.
 */
export const getChatConfig = () => {
  if (typeof window === "undefined") return Promise.resolve({});
  
  if (!configPromise) {
    configPromise = fetch("/api/chat/config")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch config");
        return r.json();
      })
      .catch((e) => {
        console.error("Config fetch error:", e);
        configPromise = null; // Allow retry on next call if failed
        return {};
      });
  }
  return configPromise;
};
