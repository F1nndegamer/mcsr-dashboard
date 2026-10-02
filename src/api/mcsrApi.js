export const API_BASE = "https://api.mcsrranked.com";
export const DEFAULT_USER = "Awenruns";
export const RANKED_MATCH_TYPE = 2;
export const MATCHES_PAGE_SIZE = 100;
export const MAX_RANKED_PAGES = 450;

export const resolveUsername = () => {
  const queryUser = new URLSearchParams(window.location.search).get("user");
  return queryUser || DEFAULT_USER;
};

export const fetchAllRankedMatches = async (username) => {
  const allMatches = [];
  let afterCursor = null;

  for (let page = 0; page < MAX_RANKED_PAGES; page += 1) {
    const params = new URLSearchParams({
      count: String(MATCHES_PAGE_SIZE),
      sort: "oldest",
      type: String(RANKED_MATCH_TYPE),
    });

    if (afterCursor) {
      params.set("after", String(afterCursor));
    }

    const response = await fetch(
      `${API_BASE}/users/${username}/matches?${params.toString()}`,
    );
    const result = await response.json();

    if (result.status !== "success" || !Array.isArray(result.data)) {
      throw new Error("Could not load all-time ranked match history.");
    }

    const pageMatches = result.data;
    if (pageMatches.length === 0) {
      break;
    }

    allMatches.push(...pageMatches);

    if (pageMatches.length < MATCHES_PAGE_SIZE) {
      break;
    }

    const lastId = pageMatches[pageMatches.length - 1]?.id;
    if (!lastId || lastId === afterCursor) {
      break;
    }

    afterCursor = lastId;
  }

  return allMatches;
};
