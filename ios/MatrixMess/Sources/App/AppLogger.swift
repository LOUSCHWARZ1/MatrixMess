import Foundation
import os

enum AppLogger {
    private static let logger = Logger(subsystem: "dev.matrixmess.app", category: "app")

    // Standardmaessig .private: Log-Meldungen koennen Raum-/Benutzer-IDs oder
    // Serverfehler enthalten und sollen in Geraete-Logs/Sysdiagnose nicht als
    // Klartext auftauchen. In Xcode/angeschlossenem Debugger bleiben sie sichtbar.
    static func info(_ message: String) {
        logger.info("\(message, privacy: .private)")
    }

    static func error(_ message: String) {
        logger.error("\(message, privacy: .private)")
    }
}
