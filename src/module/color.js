/**
 * Colour helpers. The table has no brightness control of its own -- a strip shows exactly the
 * colours it is sent -- so dimming a seat means sending darker colours.
 */
export class ZerowhaleTableColor {
    /** Parses "#rgb" or "#rrggbb" into [r, g, b], or null if it is neither. */
    static parse(color) {
        if (typeof color !== "string") {
            return null;
        }
        let hex = color.trim().replace(/^#/, "");
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
            return null;
        }
        return [
            parseInt(hex.slice(0, 2), 16),
            parseInt(hex.slice(2, 4), 16),
            parseInt(hex.slice(4, 6), 16)
        ];
    }

    static format(r, g, b) {
        const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
        return "#" + [r, g, b].map(v => clamp(v).toString(16).padStart(2, "0")).join("");
    }

    /**
     * Scales a colour's brightness. Anything unparseable is returned untouched rather than
     * turned into black, so a surprising colour still shows something.
     */
    static scale(color, factor) {
        if (factor >= 1) {
            return color;
        }
        const rgb = this.parse(color);
        if (!rgb) {
            return color;
        }
        if (factor <= 0) {
            return "#000000";
        }
        return this.format(rgb[0] * factor, rgb[1] * factor, rgb[2] * factor);
    }

    /** Scales every colour in a list. */
    static scaleAll(colors, factor) {
        return colors.map(color => this.scale(color, factor));
    }
}
