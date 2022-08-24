const { network, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../helper-hardhat-config")
require("dotenv").config()

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    let usdcAddress, freeBetTokenAddress, lottoGameAddress

    if (developmentChains.includes(network.name)) {
        const lottoGame = await ethers.getContract("LottoGame")
        const mockUSDC = await ethers.getContract("MockUSDC")
        const freeBetToken = await ethers.getContract("FreeBetToken")
        lottoGameAddress = lottoGame.address
        usdcAddress = mockUSDC.address
        freeBetTokenAddress = freeBetToken.address
    } else {
        usdcAddress = networkConfig[chainId]["usdcAddress"]
        freeBetTokenAddress = networkConfig[chainId]["freeBetTokenAddress"]
    }

    const freeBetContract = await deploy("FreeBetContract", {
        from: deployer,
        args: [
            "0xff6c568C53F564731B88266022BB46D878592098",
            freeBetTokenAddress,
            usdcAddress,
        ],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    log("---------------------------------")
}

module.exports.tags = ["all", "freeBetContract"]
