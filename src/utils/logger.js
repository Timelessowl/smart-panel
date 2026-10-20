export default class Logger {
    static LOG_LEVELS = Object.freeze({ALL: 0});
    static init() {}
    static warn() {}
    static error() {}
    static debug(message) {
        console.debug(`[simple-bottom-panel] ${message}`);
    }
}
