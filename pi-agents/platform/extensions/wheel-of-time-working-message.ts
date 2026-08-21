import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const messages = [
  "Turning the Wheel ☸️",
  "Weaving the Pattern 🧶",
  "Reading the Pattern 🧵",
  "Tracing the threads of fate 🧵",
  "Tugging at the Pattern 🪢",
  "Tying off the weave 🪢",
  "Embracing the Source ✨",
  "Channeling saidin ⚡",
  "Channeling saidar ✨",
  "Setting the wards 🛡️",
  "Delving the problem 🔍",
  "Healing the build ❤️‍🩹",
  "Shielding the side effects 🛡️",
  "Opening a gateway 🌀",
  "Skimming between tasks 🌀",
  "Dreamwalking through the stack 🌙",
  "Searching Tel'aran'rhiod 🌙",
  "Listening to the wind 🍃",
  "Seeking the flame and the void 🔥",
  "Consulting Min's viewings 👁️",
  "Reading the Karaethon Cycle 📜",
  "Searching the Thirteenth Depository 📚",
  "Studying in the White Tower 🗼",
  "Consulting the Brown Ajah 📚",
  "Waiting on the Amyrlin Seat 🪑",
  "Questioning an Aes Sedai ✨",
  "Negotiating with the Wise Ones 🏜️",
  "Seeking answers in Rhuidean 🏜️",
  "Passing beneath the glass columns 💎",
  "Consulting the Aelfinn 🦊",
  "Bargaining with the Eelfinn 🦊",
  "Rolling Mat's dice 🎲",
  "Sounding the Horn of Valere 📯",
  "Summoning the Band of the Red Hand 🏴",
  "Scouting the Blight 🐎",
  "Watching for Myrddraal 👁️",
  "Counting Trollocs 👹",
  "Checking the Dark One's seals 🔒",
  "Avoiding Mashadar 🌫️",
  "Crossing the Ways 🚪",
  "Outrunning Machin Shin 🐎",
  "Following the ta'veren 🧭",
  "Hunting the Black Ajah 🕵️",
  "Checking for Compulsion 🌀",
  "Guarding against balefire 🔥",
  "Polishing the heron-mark blade ⚔️",
  "Practicing the sword forms ⚔️",
  "Sheathing the sword 🗡️",
  "Humming to the trees 🌳",
  "Searching for the Song 🎵",
  "Remembering Manetheren 🏰",
  "Marching with the Borderlanders 🐎",
  "Negotiating with the Sea Folk 🌊",
  "Looking for water and shade 💧",
  "Checking the Ogier map 🗺️",
  "Opening the Book of Translation 📖",
  "Following Loial's directions 🗺️",
  "Feeding Bela 🐴",
  "Tugging the braid 👩‍🦰",
  "Smoothing skirts 👗",
  "Knuckling the forehead 🫡",
  "Folding arms with great significance 🙅",
  "Boxing the Dark One's ears 🥊",
  "Letting the Lord of Chaos rule 👑",
  "Preparing for Tarmon Gai'don ⚔️",
  "Waiting for the Last Battle ⏳",
  "Asking whether the Wheel wills it ☸️",
  "Letting the Pattern sort it out 🧶",
] as const;

function pickRandom(): string {
  return messages[Math.floor(Math.random() * messages.length)]!;
}

/** Shows a random Wheel of Time-themed message while Pi is working. */
export default function registerWheelOfTimeWorkingMessage(pi: ExtensionAPI): void {
  pi.on("turn_start", (_event, ctx) => {
    ctx.ui.setWorkingMessage(pickRandom());
  });

  pi.on("turn_end", (_event, ctx) => {
    ctx.ui.setWorkingMessage();
  });
}
