let useTTY = process.stdout.isTTY ?? false;

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinnerIndex = 0;
let spinnerInterval: ReturnType<typeof setInterval> | null = null;
let currentMessage = "";

export function setStdinMode(enabled: boolean): void {
  if (enabled) {
    useTTY = false;
  }
}

function render(): void {
  if (!useTTY) return;
  const frame = spinnerFrames[spinnerIndex];
  spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
  process.stdout.write(`\r\x1b[K${frame} ${currentMessage}`);
}

function startSpinner(): void {
  if (!useTTY || spinnerInterval) return;
  spinnerInterval = setInterval(render, 80);
}

function stopSpinner(): void {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
  }
}

export function clearLine(): void {
  if (useTTY) {
    process.stdout.write("\r\x1b[K");
  }
}

export function writeProgress(msg: string): void {
  currentMessage = msg;
  if (useTTY) {
    startSpinner();
    render();
  } else {
    console.log(msg);
  }
}

export function writeDone(): void {
  stopSpinner();
  if (useTTY) {
    clearLine();
    console.log("✓ Done");
  } else {
    console.log("Done");
  }
}

export function writeError(msg: string): void {
  stopSpinner();
  if (useTTY) clearLine();
  console.error(msg);
}

export function isTTY(): boolean {
  return useTTY;
}
