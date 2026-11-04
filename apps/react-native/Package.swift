// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NexusDNSCore",
    platforms: [
        .iOS(.v15),
        .macOS(.v14)
    ],
    products: [
        .library(name: "NexusDNSCore", targets: ["NexusDNSCore"])
    ],
    targets: [
        .target(
            name: "NexusDNSCore",
            path: "modules/nexus-dns/ios",
            sources: ["NexusDNSConfiguration.swift"]
        ),
        .testTarget(
            name: "NexusDNSCoreTests",
            dependencies: ["NexusDNSCore"],
            path: "swift-tests"
        )
    ]
)