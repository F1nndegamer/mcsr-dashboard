import { render, screen } from "@testing-library/react";
import StartingSoonOverlay from "./StartingSoonOverlay";
import StreamBreakOverlay from "./StreamBreakOverlay";
import StreamEndedOverlay from "./StreamEndedOverlay";
import { resolveOverlayScene, resolveSceneConfig } from "./sceneConfig";

const setUrl = (url) => window.history.replaceState({}, "", url);

afterEach(() => {
  setUrl("/");
});

describe("resolveOverlayScene", () => {
  it("resolves scenes from path, hash and query", () => {
    expect(
      resolveOverlayScene({ pathname: "/overlay/starting", hash: "", search: "" }),
    ).toBe("starting");
    expect(
      resolveOverlayScene({ pathname: "/overlay/brb", hash: "", search: "" }),
    ).toBe("brb");
    expect(
      resolveOverlayScene({ pathname: "/overlay/ending", hash: "", search: "" }),
    ).toBe("ending");
    expect(
      resolveOverlayScene({ pathname: "/overlay", hash: "#/overlay/brb", search: "" }),
    ).toBe("brb");
    expect(
      resolveOverlayScene({ pathname: "/", hash: "", search: "?scene=ending" }),
    ).toBe("ending");
    expect(
      resolveOverlayScene({ pathname: "/", hash: "", search: "?overlay=starting" }),
    ).toBe("starting");
  });

  it("falls back to the stats overlay (null)", () => {
    expect(
      resolveOverlayScene({ pathname: "/overlay", hash: "", search: "" }),
    ).toBeNull();
    expect(
      resolveOverlayScene({ pathname: "/", hash: "", search: "?overlay=1" }),
    ).toBeNull();
    expect(resolveOverlayScene({ pathname: "/", hash: "", search: "" })).toBeNull();
  });
});

describe("resolveSceneConfig", () => {
  it("uses per-scene countdown defaults", () => {
    expect(resolveSceneConfig("starting", "").countdownSeconds).toBe(300);
    expect(resolveSceneConfig("brb", "").countdownSeconds).toBe(180);
    expect(resolveSceneConfig("ending", "").countdownSeconds).toBeNull();
  });

  it("honours ?countdown= and hides it with 0", () => {
    expect(resolveSceneConfig("starting", "?countdown=90").countdownSeconds).toBe(90);
    expect(resolveSceneConfig("starting", "?countdown=0").countdownSeconds).toBeNull();
  });

  it("reads the next-stream text", () => {
    expect(resolveSceneConfig("ending", "?next=Saturday").nextStream).toBe("Saturday");
    expect(resolveSceneConfig("ending", "").nextStream).toBeNull();
  });
});

describe("scene rendering", () => {
  it("renders the starting soon scene with countdown", () => {
    render(<StartingSoonOverlay />);
    expect(screen.getByText("Stream Starting Soon")).toBeInTheDocument();
    expect(screen.getByText("Starts In")).toBeInTheDocument();
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByText("STANDBY")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows a blinking pixel-dots loader while counting down", () => {
    const { container } = render(<StartingSoonOverlay />);
    // Decorative loader: assert its three pixel dots via a single scoped query.
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelectorAll(".mcsr-scene__countdown-dots i")).toHaveLength(3);
  });

  it("renders the be right back scene", () => {
    render(<StreamBreakOverlay />);
    expect(screen.getByText("Be Right Back")).toBeInTheDocument();
    expect(screen.getByText("Stream Is On A Break")).toBeInTheDocument();
    expect(screen.getByText("Back In")).toBeInTheDocument();
    expect(screen.getByText("3:00")).toBeInTheDocument();
    expect(screen.getByText("ON BREAK")).toBeInTheDocument();
  });

  it("renders the ending scene with social links and a next-stream card", () => {
    setUrl("/?scene=ending&next=Saturday%2020:00");
    render(<StreamEndedOverlay />);
    expect(screen.getByText("Stream Ended")).toBeInTheDocument();
    expect(screen.getByText("Thanks For Watching")).toBeInTheDocument();
    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
    expect(screen.getByText("Saturday 20:00")).toBeInTheDocument();
  });

  it("hides the countdown when ?countdown=0", () => {
    setUrl("/?scene=starting&countdown=0");
    render(<StartingSoonOverlay />);
    expect(screen.getByText("Stream Starting Soon")).toBeInTheDocument();
    expect(screen.queryByText("Starts In")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
