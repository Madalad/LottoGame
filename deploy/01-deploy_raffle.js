const { network } = require("hardhat")
const {
    developmentChains,
    networkConfig,
    POOCOIN_ADDRESS,
} = require("../helper-hardhat-config")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    const subscriptionId = networkConfig[chainId]["subscriptionId"]
    const keyHash = networkConfig[chainId]["vrfKeyHash"]

    let vrfCoordinator
    let usdcAddress

    if (developmentChains.includes(network.name)) {
        const vrfCoordinatorMock = await deployments.get("VRFCoordinatorV2Mock")
        const mockUSDC = await deployments.get("MockUSDC")
        vrfCoordinator = vrfCoordinatorMock.address
        usdcAddress = mockUSDC.address
    } else {
        vrfCoordinator = networkConfig[chainId]["vrfCoordinatorAddress"]
        usdcAddress = network.config.usdcAddress
    }

    const raffle = await deploy("Raffle", {
        from: deployer,
        args: [subscriptionId, keyHash, vrfCoordinator, usdcAddress],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    log("---------------------------------")
}

module.exports.tags = ["all", "raffle"]
