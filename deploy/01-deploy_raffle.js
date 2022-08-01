const { network } = require("hardhat")
const { developmentChains, networkConfig } = require("../helper-hardhat-config")
require("dotenv").config()

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer, vault } = await getNamedAccounts()
    const chainId = network.config.chainId

    const subscriptionId = network.config.subscriptionId
    const keyHash = networkConfig[chainId]["vrfKeyHash"]
    const vaultAddress = vault

    let vrfCoordinator
    let usdcAddress

    if (developmentChains.includes(network.name)) {
        const vrfCoordinatorMock = await deployments.get("VRFCoordinatorV2Mock")
        const mockUSDC = await deployments.get("MockUSDC")
        const accounts = ethers.getSigners()
        vrfCoordinator = vrfCoordinatorMock.address
        usdcAddress = mockUSDC.address
    } else {
        vrfCoordinator = networkConfig[chainId]["vrfCoordinatorAddress"]
        usdcAddress = networkConfig[chainId]["usdcAddress"]
    }

    const raffle = await deploy("Raffle", {
        from: deployer,
        args: [
            subscriptionId,
            keyHash,
            vrfCoordinator,
            usdcAddress,
            vaultAddress,
        ],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    log("---------------------------------")
}

module.exports.tags = ["all", "raffle"]
