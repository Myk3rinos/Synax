// Simple in-memory history with timestamps and role labels

let historyBuffer: string[] = [];

function timestamp(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const Y = now.getFullYear();
    const M = pad(now.getMonth() + 1);
    const D = pad(now.getDate());
    const h = pad(now.getHours());
    const m = pad(now.getMinutes());
    const s = pad(now.getSeconds());
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

export function addHistory(entry: string): void {
    if (entry == null) return;
    const lines = String(entry).split(/\r?\n/);
    for (const line of lines) {
        if (line.trim().length === 0) continue;
        historyBuffer.push(`[${timestamp()}] RESPONSE: ${line}`);
    }
}

export function addUserInput(input: string): void {
    if (input == null) return;
    const lines = String(input).split(/\r?\n/);
    for (const line of lines) {
        if (line.trim().length === 0) continue;
        historyBuffer.push(`[${timestamp()}] USER: ${line}`);
    }
}

export function getHistory(): string {
    return historyBuffer.join('\n');
}

export function clearHistory(): void {
    historyBuffer = [];
}
