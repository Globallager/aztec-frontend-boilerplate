import tailwindConfig from "./tailwind.config.js";
import tailwindcss from "tailwindcss"
import autoprefixer from "autoprefixer";

module.exports = {
  plugins: [tailwindcss(tailwindConfig), autoprefixer],
};

// export const plugins = [tailwindcss(tailwindConfig), autoprefixer];
