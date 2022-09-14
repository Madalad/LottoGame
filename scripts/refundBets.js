const { ethers } = require("hardhat")
const { networkConfig } = require("../helper-hardhat-config")

/**
 * Refunds all unsettled bets
 * Contract address is pulled from config files
 */
async function main() {
    const chainId = network.config.chainId
    const lottoGameAddress = networkConfig[chainId]["lottoGameAddress"]
    const mockUSDCAddress = networkConfig[chainId]["usdcAddress"]

    const LottoGameFactory = await ethers.getContractFactory("LottoGame")
    lottoGame = LottoGameFactory.attach(lottoGameAddress)
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC")
    mockUSDC = MockUSDCFactory.attach(mockUSDCAddress)
    console.log("LottoGame contract address:", lottoGame.address)
    const balance = await lottoGame.getBalance()
    console.log(
        "Contract balance:",
        (await mockUSDC.balanceOf(lottoGameAddress)).toString()
    )

    let countBettors = await lottoGame.getCountBettors()
    console.log("Count bettors:", countBettors.toString())
    console.log("Refunding bets...")
    const txResponse = await lottoGame.refundBets(/*{ gasLimit: 100000 }*/)
    await txResponse.wait(2)
    console.log("Bets refunded.")
    countBettors = await lottoGame.getCountBettors()
    console.log("Count bettors:", countBettors.toString())
    console.log(
        "Contract balance:",
        (await mockUSDC.balanceOf(lottoGameAddress)).toString()
    )
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
