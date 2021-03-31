/**
 * Translation Tool for PreMiD Presences.
 * @author callumok2004 <callumokane123@gmail.com>
 * @author Bas950 <me@bas950.com>
 */

import axios from "axios";
import { green, hex, red, white, yellow } from "chalk";
import debug from "debug";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { Answers, prompt } from "inquirer";
import ora, { Ora } from "ora";

debug.enable("Translator:*");
let loadSpinner: Ora,
  language: string,
  files: Files,
  counter = 0;

const spinnerSettings = {
    interval: 80,
    frames: [
      hex("#bebebe")(`( ${white("●")}   )`),
      hex("#bebebe")(`(  ${white("●")}  )`),
      hex("#bebebe")(`(   ${white("●")} )`),
      hex("#bebebe")(`(    ${white("●")})`),
      hex("#bebebe")(`(   ${white("●")} )`),
      hex("#bebebe")(`(  ${white("●")}  )`),
      hex("#bebebe")(`( ${white("●")}   )`),
      hex("#bebebe")(`(${white("●")}    )`)
    ]
  },
  filesMap = new Map(),
  logger = debug("Translator"),
  success = logger.extend("success"),
  error = logger.extend("error"),
  info = logger.extend("info"),
  checkCount = async (): Promise<boolean> => {
    if (counter <= 0) {
      success(`Complete! All presences have the language: ${language}`);
      process.exit();
    } else return false;
  },
  loadFiles = async (lang: string): Promise<boolean> => {
    language = lang;
    info("Loading and caching files.");
    const src = `${process.cwd()}/websites/`;
    if (!existsSync(src))
      return (
        error("Presences folder could not be found... exiting."), process.exit()
      );

    readdirSync(src).forEach((letter) => {
      readdirSync(`${src}/${letter}/`).forEach(async (presence) => {
        const data = JSON.parse(
          readFileSync(
            `${src}/${letter}/${presence}/dist/metadata.json`,
            "utf8"
          ).toString()
        );
        data.path = `${src}/${letter}/${presence}/dist/metadata.json`;
        filesMap.set(presence, data);
      });
    });

    success(`Loading complete. ${filesMap.size} presences loaded.`);
    info(`Clearing presences with language: ${language}.`);

    for (const file of filesMap)
      if (file[1].description[language]) filesMap.delete(file[0]);

    loadSpinner.succeed(
      green(` Loaded all presences… (${filesMap.size} to translate)`)
    );

    return true;
  },
  main = async () => {
    const langLoadSpinner = ora({
      text: green(`Loading languages…`)
    });
    langLoadSpinner.spinner = spinnerSettings;
    langLoadSpinner.start();
    const langs: string[] = (
      await axios.post("https://api.premid.app/v3", {
        query: `
        query {
          langFiles(project: "website") {
            lang
          }
        }
        `
      })
    ).data.data.langFiles
      .map((c: { lang: string }) => c.lang)
      .filter((c: string) => c !== "en");
    langLoadSpinner.succeed(green(` Loaded all languages.`));
    const language: string = await prompt([
        {
          type: "list",
          prefix: "●",
          message: green("Pick the language you want to translate:"),
          name: "selectedLang",
          choices: langs.sort()
        }
      ]).then((answer: Answers) => answer.selectedLang),
      loadFilesSpinner = ora({
        text: green(`Loading presences... \n`)
      });

    loadSpinner = loadFilesSpinner;

    loadFilesSpinner.spinner = spinnerSettings;
    loadFilesSpinner.start();
    await loadFiles(language);

    const mode: Mode = await prompt([
      {
        type: "list",
        prefix: "●",
        message: green("Pick the Translator Mode:"),
        name: "mode",
        choices: [
          {
            name: "Translate every Presence in order.",
            value: "EVERY"
          },
          {
            name: "Translate every Presence of category.",
            value: "CATEGORY"
          },
          {
            name: "Translate selected Presences.",
            value: "SELECT"
          }
        ]
      }
    ]).then((answer: Answers) => answer.mode);
    switch (mode) {
      case "EVERY":
        files = Array.from(filesMap);
        break;
      case "CATEGORY":
        {
          const category: Metadata["category"] = await prompt([
            {
              type: "list",
              prefix: "●",
              message: green("Pick a category:"),
              name: "category",
              choices: [
                {
                  name: "Anime",
                  value: "anime"
                },
                {
                  name: "Games",
                  value: "games"
                },
                {
                  name: "Music",
                  value: "music"
                },
                {
                  name: "Socials",
                  value: "socials"
                },
                {
                  name: "Videos & Streams",
                  value: "videos"
                },
                {
                  name: "Other",
                  value: "other"
                }
              ]
            }
          ]).then((answer: Answers) => answer.category);
          files = (Array.from(filesMap) as Files).filter(
            (f) => f[1].category === category
          );
        }
        break;
      case "SELECT":
        {
          const selected = await prompt([
            {
              type: "checkbox",
              prefix: "●",
              message: green("Pick the Presences:"),
              name: "selected",
              choices: (Array.from(filesMap) as Files).map((f) => f[0])
            }
          ]).then((answer: Answers) => answer.selected);
          files = (Array.from(filesMap) as Files).filter((f) =>
            selected.includes(f[0])
          );
        }
        break;
      default:
        error(red("Unknown Mode selected…"));
        process.exit();
    }

    counter = files.length;
    for await (const file of files) {
      counter--;
      const data = file[1],
        path = data.path,
        check = JSON.parse(await readFileSync(data.path).toString());

      if (check.description[language]) {
        error(`${file[0]} has already been translated to ${language}.`);
        continue;
      }

      const response = await prompt([
          {
            type: "input",
            prefix: "●",
            message:
              green("Please translate the following description of ") +
              yellow(file[0]) +
              green(`:\n"`) +
              hex("#bebebe")(file[1].description["en"]) +
              green(`":\n`) +
              hex("#bebebe")(`(Type "skip" to skip)`),
            name: "translatedDes"
          }
        ]).then((answer: Answers) => answer.translatedDes),
        ver = data.version.split(".");

      if (response === "skip") {
        filesMap.delete(file[0]);
        await checkCount();
        continue;
      }
      data.version = `${ver[0]}.${ver[1]}.${Number(ver[2]) + 1}`;
      data.description[language] = response;
      delete data.path;

      writeFileSync(path, JSON.stringify(data, null, 2));
      filesMap.delete(file[0]);
      await checkCount();
    }
  };

main();

//* Types
interface metadata extends Metadata {
  path?: string;
}
type Mode = "EVERY" | "CATEGORY" | "SELECT";
type Files = [string, metadata][];