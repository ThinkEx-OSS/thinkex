import { ImageResponse } from "next/og";
import { db, workspaces } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import fs from "node:fs/promises";
import path from "node:path";

export const alt = "Shared Workspace";
export const size = {
    width: 1200,
    height: 630,
};

export const contentType = "image/png";

// Helper to convert hex to rgba
function hexToRgba(hex: string, alpha: number) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Load Google Font dynamically
async function loadGoogleFont(font: string, text: string) {
    const url = `https://fonts.googleapis.com/css2?family=${font}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url)).text();
    const resource = css.match(/src: url\((.+)\) format\('(opentype|truetype)'\)/);

    if (resource) {
        const response = await fetch(resource[1]);
        if (response.status == 200) {
            return await response.arrayBuffer();
        }
    }

    throw new Error('failed to load font data');
}

// Calculate number of skeleton bars based on title length
function getSkeletonCount(titleLength: number): number {
    // Shorter titles = more skeleton bars
    // Longer titles = fewer skeleton bars
    if (titleLength < 20) return 5;
    if (titleLength < 40) return 4;
    if (titleLength < 60) return 3;
    return 2;
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    // Fetch workspace data
    const workspace = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, id))
        .limit(1);

    if (!workspace[0]) {
        return new ImageResponse(
            (
                <div
                    style={{
                        fontSize: 48,
                        background: "white",
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    Workspace Not Found
                </div>
            ),
            {
                ...size,
            }
        );
    }

    const state = await loadWorkspaceState(id);
    const title = state.globalTitle || workspace[0].name || "Untitled Workspace";
    const noteCount = state.items.length;
    const description = `Import this shared workspace with ${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`;
    const color = workspace[0].color || "#3B82F6";

    // Get first 4 workspace cards for floating cards
    const workspaceCards = state.items.slice(0, 4);

    // Load the static image from filesystem
    let logoSrc = "";
    try {
        const imagePath = path.join(process.cwd(), "public", "newlogothinkex.svg");
        const imageBuffer = await fs.readFile(imagePath);
        logoSrc = `data:image/svg+xml;base64,${imageBuffer.toString("base64")}`;
    } catch (error) {
        console.error("Error loading logo image:", error);
    }

    // Collect all text for font loading
    const allText = title + description + 'ThinkEx' + workspaceCards.map(c => c.name).join('');
    const fontData = await loadGoogleFont('Outfit:wght@400', allText);

    // Card styles based on Hero.tsx
    const cardBaseStyle = {
        position: "absolute" as const,
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.2)", // border-foreground/20
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)", // shadow-xl
        display: "flex",
        flexDirection: "column" as const,
        padding: "12px",
        gap: "8px",
    };

    const cardContentBarStyle = {
        borderRadius: "4px",
        background: "rgba(255,255,255,0.2)",
    };

    return new ImageResponse(
        (
            <div
                style={{
                    background: "#09090b", // zinc-950
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    fontFamily: '"Outfit"',
                    color: "white",
                    position: "relative",
                    overflow: "visible",
                }}
            >
                {/* Grid Pattern Background */}
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage: `
              linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px)
            `,
                        backgroundSize: "50px 50px",
                        width: "100%",
                        height: "100%",
                    }}
                />

                {/* Background Gradient Blob */}
                <div
                    style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: "140%",
                        height: "140%",
                        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
                        opacity: 0.15,
                        pointerEvents: "none",
                    }}
                />

                {/* Top Left: Title and Description */}
                <div
                    style={{
                        position: "absolute",
                        top: "50px",
                        left: "50px",
                        display: "flex",
                        flexDirection: "column",
                        maxWidth: "500px",
                        zIndex: 10,
                    }}
                >
                    {/* Title */}
                    <div
                        style={{
                            fontSize: "64px",
                            fontWeight: "normal",
                            marginBottom: "16px",
                            background: "linear-gradient(to bottom right, #ffffff, #a1a1aa)",
                            backgroundClip: "text",
                            color: "transparent",
                            lineHeight: 1.1,
                            letterSpacing: "-0.02em",
                            maxWidth: "500px",
                            wordWrap: "break-word",
                            whiteSpace: "normal",
                        }}
                    >
                        {title}
                    </div>

                    {/* Description */}
                    <div
                        style={{
                            fontSize: "36px",
                            color: "#a1a1aa",
                            lineHeight: 1.4,
                            maxWidth: "420px",
                            wordWrap: "break-word",
                            whiteSpace: "normal",
                        }}
                    >
                        {description}
                    </div>
                </div>

                {/* Center: Card Grid */}
                <div
                    style={{
                        position: "absolute",
                        top: "50%",
                        left: "68%",
                        transform: "translate(-50%, -50%)",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "24px",
                        width: "800px",
                        justifyContent: "center",
                        alignItems: "center",
                        overflow: "visible",
                    }}
                >
                    {/* Card 1 */}
                    {workspaceCards[0] && (
                        <div
                            style={{
                                ...cardBaseStyle,
                                position: "relative",
                                width: "340px",
                                height: "280px",
                                background: hexToRgba(workspaceCards[0].color || "#8B5CF6", 0.12),
                            }}
                        >
                            <div style={{ fontSize: "28px", fontWeight: "600", color: "rgba(255,255,255,0.95)", marginBottom: "16px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.3 }}>
                                {workspaceCards[0].name}
                            </div>
                            {Array.from({ length: getSkeletonCount(workspaceCards[0].name.length) }).map((_, i) => (
                                <div key={i} style={{ ...cardContentBarStyle, width: `${100 - i * 10}%`, height: "8px", opacity: 0.5 - i * 0.1, marginBottom: i < getSkeletonCount(workspaceCards[0].name.length) - 1 ? "8px" : "0" }} />
                            ))}
                            <div style={{ flex: 1 }} />
                        </div>
                    )}

                    {/* Card 2 */}
                    {workspaceCards[1] && (
                        <div
                            style={{
                                ...cardBaseStyle,
                                position: "relative",
                                width: "340px",
                                height: "280px",
                                background: hexToRgba(workspaceCards[1].color || "#3B82F6", 0.12),
                            }}
                        >
                            <div style={{ fontSize: "28px", fontWeight: "600", color: "rgba(255,255,255,0.95)", marginBottom: "16px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.3 }}>
                                {workspaceCards[1].name}
                            </div>
                            {Array.from({ length: getSkeletonCount(workspaceCards[1].name.length) }).map((_, i) => (
                                <div key={i} style={{ ...cardContentBarStyle, width: `${100 - i * 8}%`, height: "8px", opacity: 0.5 - i * 0.1, marginBottom: i < getSkeletonCount(workspaceCards[1].name.length) - 1 ? "8px" : "0" }} />
                            ))}
                            <div style={{ flex: 1 }} />
                        </div>
                    )}

                    {/* Card 3 */}
                    {workspaceCards[2] && (
                        <div
                            style={{
                                ...cardBaseStyle,
                                position: "relative",
                                width: "340px",
                                height: "280px",
                                background: hexToRgba(workspaceCards[2].color || "#10B981", 0.12),
                            }}
                        >
                            <div style={{ fontSize: "28px", fontWeight: "600", color: "rgba(255,255,255,0.95)", marginBottom: "16px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.3 }}>
                                {workspaceCards[2].name}
                            </div>
                            {Array.from({ length: getSkeletonCount(workspaceCards[2].name.length) }).map((_, i) => (
                                <div key={i} style={{ ...cardContentBarStyle, width: `${95 - i * 10}%`, height: "8px", opacity: 0.5 - i * 0.1, marginBottom: i < getSkeletonCount(workspaceCards[2].name.length) - 1 ? "8px" : "0" }} />
                            ))}
                            <div style={{ flex: 1 }} />
                        </div>
                    )}

                    {/* Card 4 */}
                    {workspaceCards[3] && (
                        <div
                            style={{
                                ...cardBaseStyle,
                                position: "relative",
                                width: "340px",
                                height: "280px",
                                background: hexToRgba(workspaceCards[3].color || "#F59E0B", 0.12),
                            }}
                        >
                            <div style={{ fontSize: "28px", fontWeight: "600", color: "rgba(255,255,255,0.95)", marginBottom: "16px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.3 }}>
                                {workspaceCards[3].name}
                            </div>
                            {Array.from({ length: getSkeletonCount(workspaceCards[3].name.length) }).map((_, i) => (
                                <div key={i} style={{ ...cardContentBarStyle, width: `${100 - i * 12}%`, height: "8px", opacity: 0.5 - i * 0.1, marginBottom: i < getSkeletonCount(workspaceCards[3].name.length) - 1 ? "8px" : "0" }} />
                            ))}
                            <div style={{ flex: 1 }} />
                        </div>
                    )}
                </div>

                {/* Footer Branding */}
                <div
                    style={{
                        position: "absolute",
                        bottom: "40px",
                        left: "50px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                    }}
                >
                    {/* Logo */}
                    {logoSrc && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={logoSrc}
                            alt="ThinkEx Logo"
                            style={{
                                width: "40px",
                                height: "40px",
                                borderRadius: "8px",
                            }}
                        />
                    )}
                    <div
                        style={{
                            fontSize: "48px",
                            fontWeight: "normal",
                            color: "#ffffff",
                            letterSpacing: "0.02em",
                        }}
                    >
                        ThinkEx
                    </div>
                </div>
            </div>
        ),
        {
            ...size,
            fonts: [
                {
                    name: "Outfit",
                    data: fontData,
                    style: "normal",
                },
            ],
        }
    );
}
