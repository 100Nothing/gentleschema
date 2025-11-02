// ANSI helpers
const reset = "\x1b[0m";
const bold = "\x1b[1m";
const italic = "\x1b[3m";

const cyan = "\x1b[36m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";

const bullet = `${green}•${reset}`;

console.log(
    [
        `${bold}${cyan}Example scripts to run:${reset}`,
        ``,
        `  ${bullet}  example-basic`,
        `  ${bullet}  example-bb (batch benchmark)`,
        `  ${bullet}  example-conditionals`,
        `  ${bullet}  example-express`,
        `  ${bullet}  example-refs`,
        ``,
        `${italic}Run any of these with${reset}  ${yellow}\`npm run example-*\`${reset}`,
        `${italic}Example:${reset}  ${yellow}\`npm run example-basic\`${reset}`,
        ``
    ].join("\n")
);