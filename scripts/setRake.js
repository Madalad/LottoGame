const { ethers } = require("hardhat")

/**
 * Sets rake to input desired amount (line 9)
 * Contract address is pulled from config files
 */
async function main() {
    /* Desired rake */
    const newRake = 0

    const lottoGameAddress = network.config.contractAddress
    const LottoGameFactory = await ethers.getContractFactory("LottoGame")
    lottoGame = LottoGameFactory.attach(lottoGameAddress)

    console.log("Contract address:", lottoGameAddress)
    console.log("Rake:", (await lottoGame.getRake()).toString())
    const txResponse = await lottoGame.setRake(newRake)
    await txResponse.wait(1)
    console.log("Rake updated.")
    console.log("Rake:", (await lottoGame.getRake()).toString())
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
