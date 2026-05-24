import React, { useMemo, useState, useEffect } from "react";

const RANKED_MATCH_TYPE = 2;
const PRIVATE_MATCH_TYPE = 3;

const formatDuration = (match, userUuid, accountforwin = true) => {
  var ms = match.result?.time;
  if (!accountforwin && match.result?.uuid === userUuid) return "";
  if (typeof ms !== "number") return "";
  if (!match.forfeited) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = ms % 1000;

    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  } else return "";
};

const getMatchResult = (match, userUuid) => {
  if (match.forfeited) {
    if (match.result?.uuid) {
      if (match.result.uuid === userUuid)
        return { label: "WIN (Forfeit)", color: "text-minecraft-green" };
      return { label: "LOST (Forfeit)", color: "text-red-300" };
    }
    return { label: "DRAW", color: "text-blue-300" };
  }

  if (!match.result?.uuid) return { label: "DRAW", color: "text-blue-300" };
  if (match.result.uuid === userUuid)
    return {
      label: formatDuration(match, userUuid),
      color: "text-minecraft-green",
    };
  return { label: "LOST", color: "text-red-300" };
};

const PAGE_SIZE = 6;

const RecentMatchesCard = ({
  matches,
  userUuid,
  onMatchSelect,
  selectedMatchId,
}) => {
  const [activeType, setActiveType] = useState(RANKED_MATCH_TYPE);
  const [page, setPage] = useState(1);

  const filteredMatches = useMemo(
    () => matches.filter((match) => match.type === activeType),
    [matches, activeType],
  );

  useEffect(() => {
    setPage(1);
  }, [activeType]);

  useEffect(() => {
    const totalPages = Math.max(
      1,
      Math.ceil(filteredMatches.length / PAGE_SIZE),
    );
    if (page > totalPages) setPage(totalPages);
  }, [filteredMatches, page]);

  return (
    <div className="glass-panel p-6 overflow-hidden">
      <h3 className="text-xs font-bold uppercase mb-1">Recent Matches</h3>
      <p className="text-xs text-gray-400 mb-4">
        Click a row to pin match details
      </p>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setActiveType(RANKED_MATCH_TYPE)}
          className={`text-xs px-3 py-1.5 rounded-full border transition ${
            activeType === RANKED_MATCH_TYPE
              ? "border-minecraft-green/80 text-minecraft-green bg-minecraft-green/10"
              : "border-white/15 text-gray-300 hover:bg-white/5"
          }`}
        >
          Ranked
        </button>
        <button
          type="button"
          onClick={() => setActiveType(PRIVATE_MATCH_TYPE)}
          className={`text-xs px-3 py-1.5 rounded-full border transition ${
            activeType === PRIVATE_MATCH_TYPE
              ? "border-minecraft-gold/80 text-minecraft-gold bg-minecraft-gold/10"
              : "border-white/15 text-gray-300 hover:bg-white/5"
          }`}
        >
          Private
        </button>
      </div>

      {filteredMatches.length === 0 ? (
        <p className="text-sm text-gray-400">
          No {activeType === RANKED_MATCH_TYPE ? "ranked" : "private"} matches
          in this recent window.
        </p>
      ) : (
        <div className="space-y-4">
          {(() => {
            const totalPages = Math.max(
              1,
              Math.ceil(filteredMatches.length / PAGE_SIZE),
            );
            const displayedMatches = filteredMatches.slice(
              (page - 1) * PAGE_SIZE,
              page * PAGE_SIZE,
            );

            return (
              <>
                {displayedMatches.map((match) => {
                  const result = getMatchResult(match, userUuid);
                  const seedLabel =
                    match.seed?.overworld || match.seedType || "Unknown Seed";
                  const isSelected = selectedMatchId === match.id;

                  return (
                    <button
                      type="button"
                      key={match.id}
                      onClick={() => onMatchSelect && onMatchSelect(match)}
                      className={`w-full text-left flex justify-between items-center text-sm border-b pb-2 transition ${
                        isSelected
                          ? "border-minecraft-gold/70 bg-white/5 rounded px-2 py-1 -mx-2 -my-1"
                          : "border-white/5 hover:bg-white/5 rounded px-2 py-1 -mx-2 -my-1"
                      }`}
                    >
                      <div>
                        <p className="font-bold">{seedLabel}</p>
                        <p className="text-xs text-gray-500">
                          Season {match.season} • #{match.id}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={result.color}>{result.label}</p>
                        <p className="text-[10px] text-gray-500">
                          {formatDuration(
                            match,
                            userUuid,
                            false,
                            //Dont show duration for wins
                          )}
                        </p>
                      </div>
                    </button>
                  );
                })}

                {/* Pagination controls */}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className={`text-xs px-3 py-1.5 rounded-full border transition ${page <= 1 ? "opacity-50 cursor-not-allowed" : "border-white/15 text-gray-300 hover:bg-white/5"}`}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page >= totalPages}
                      className={`text-xs px-3 py-1.5 rounded-full border transition ${page >= totalPages ? "opacity-50 cursor-not-allowed" : "border-white/15 text-gray-300 hover:bg-white/5"}`}
                    >
                      Next
                    </button>
                  </div>

                  <div>
                    <span className="text-xs text-gray-400">
                      Page {page} of {totalPages}
                    </span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default RecentMatchesCard;
