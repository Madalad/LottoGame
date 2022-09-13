const { assert } = require("chai")
const { ethers } = require("hardhat")
const {
    developmentChains,
    networkConfig,
} = require("../../helper-hardhat-config")
require("dotenv").config()

/**
 * Contract must be pre-deployed
 * Subscription must be set up and funded
 * Contract must be added as a consumer (scripts/addConsumer.js)
 */
developmentChains.includes(network.name)
    ? describe.skip
    : describe("FreeBetContract staging tests", async function () {
          let lottoGame, mockUSDC, freeBetContract, freeBetToken, txResponse
          const chainId = network.config.chainId
          const lottoGameAddress = network.config.contractAddress
          const usdcAddress = networkConfig[chainId]["usdcAddress"]
          const freeBetContractAddress =
              networkConfig[chainId]["freeBetContractAddress"]
          const freeBetTokenAddress =
              networkConfig[chainId]["freeBetTokenAddress"]
          const betAmount = 5 * 10 ** 6 // $5
          const blockConfirmations = network.config.blockConfirmations

          beforeEach(async function () {
              const { deployer } = await ethers.getNamedSigners()
              const LottoGameFactory = await ethers.getContractFactory(
                  "LottoGame"
              )
              lottoGame = LottoGameFactory.attach(lottoGameAddress)
              const MockUSDCFactory = await ethers.getContractFactory(
                  "MockUSDC"
              )
              mockUSDC = MockUSDCFactory.attach(usdcAddress)
              const FreeBetTokenFactory = await ethers.getContractFactory(
                  "FreeBetToken"
              )
              freeBetToken = FreeBetTokenFactory.attach(freeBetTokenAddress)
              const FreeBetContractFactory = await ethers.getContractFactory(
                  "FreeBetContract"
              )
              freeBetContract = FreeBetContractFactory.attach(
                  freeBetContractAddress
              )

              // make sure rake is 0
              txResponse = await lottoGame.setRake("0")
              await txResponse.wait(blockConfirmations)
              console.log("")
              console.log("Rake set to 0.")
              // make sure freeBetContract is funded
              const deployerFbtBalance = await freeBetToken.balanceOf(
                  deployer.address
              )
              txResponse = await freeBetToken.transfer(
                  freeBetContract.address,
                  deployerFbtBalance
              )
              await txResponse.wait(blockConfirmations)
              console.log("FBT sent to FreeBetContract.")
              // approve FreeBetContract to spend deployers USD (for distributeFbt())
              txResponse = await mockUSDC.approve(
                  freeBetContract.address,
                  betAmount
              )
              await txResponse.wait(blockConfirmations)

              console.log("")
              console.log("LottoGame contract address:", lottoGame.address)
              console.log("MockUSDC contract address: ", mockUSDC.address)
              console.log(
                  "FreeBetContract contract address: ",
                  freeBetContract.address
              )
              console.log(
                  "FreeBetToken (FBT) contract address: ",
                  freeBetToken.address
              )
              console.log("")
          })
          it("should accept a free bet and settle properly", async function () {
              console.log("Block confirmations:", blockConfirmations)
              console.log("")

              const { deployer, bettor } = await ethers.getNamedSigners()

              // empty deployers FBT balance (needs 0 balance for bet requirement values to update upon distribution)
              /*const fundAmount = await freeBetToken.balanceOf(deployer.address)
              txResponse = await freeBetToken.transfer(
                  freeBetContract.address,
                  fundAmount
              )
              await txResponse.wait(blockConfirmations)
              console.log("FBT sent to FreeBetContract.")*/

              // distribute FBT
              console.log("Distributing FBT...")
              console.log(
                  (await mockUSDC.balanceOf(deployer.address)).toString()
              )
              console.log(
                  (
                      await freeBetToken.balanceOf(freeBetContract.address)
                  ).toString()
              )
              console.log(betAmount.toString())
              txResponse = await freeBetContract.distributeFbt(
                  deployer.address,
                  betAmount
              )
              await txResponse.wait(blockConfirmations)
              console.log("FBT distributed to deployer.")
              console.log("")

              // deployer will bet with FreeBetToken
              // bettor will bet with MockUSDC
              // ensure each account has sufficient funds before running staging test
              const deployerStartBalanceFBT = await freeBetToken.balanceOf(
                  deployer.address
              )
              const deployerStartBalanceUSD = await mockUSDC.balanceOf(
                  deployer.address
              )
              const bettorStartBalance = await mockUSDC.balanceOf(
                  bettor.address
              )
              const contractStartBalance = await lottoGame.getBalance()
              const freeBetContractStartBalance = await mockUSDC.balanceOf(
                  freeBetContract.address
              )
              console.log(
                  "Deployer start balance (fUSD): ",
                  deployerStartBalanceFBT.toString()
              )
              console.log(
                  "Deployer start balance (mUSDC):",
                  deployerStartBalanceUSD.toString()
              )
              console.log(
                  "Bettor start balance (mUSDC):  ",
                  bettorStartBalance.toString()
              )
              console.log(
                  "Contract start balance (mUSDC):",
                  contractStartBalance.toString()
              )
              console.log(
                  "FreebetC start balance (mUSDC):",
                  freeBetContractStartBalance.toString()
              )
              console.log("")

              const betRequirementProgressStart =
                  await freeBetContract.betRequirementProgress(deployer.address)
              const betRequirementTotalStart =
                  await freeBetContract.betRequirementTotal(deployer.address)
              console.log(
                  "Bet requirement progress:",
                  betRequirementProgressStart.toString()
              )
              console.log(
                  "Bet requirement total:   ",
                  betRequirementTotalStart.toString()
              )
              console.log("")

              console.log("Bet amount =", betAmount.toString(), "($5)")
              // place deployer bet (free bet)
              await lottoGame.setFreeBetContractAddress(freeBetContract.address)
              console.log("Approving...")
              txResponse = await freeBetToken.approve(
                  freeBetContract.address,
                  betAmount
              )
              await txResponse.wait(blockConfirmations)
              console.log("Approved FBT")
              console.log("Betting...")
              txResponse = await freeBetContract.bet(betAmount)
              await txResponse.wait(blockConfirmations)
              console.log("Deployer bet placed (free bet).")
              // place bettor bet (real bet)
              const mockUSDCConnectedContract = mockUSDC.connect(bettor)
              txResponse = await mockUSDCConnectedContract.approve(
                  lottoGame.address,
                  betAmount
              )
              await txResponse.wait(blockConfirmations)
              const lottoGameConnectedContract = lottoGame.connect(bettor)
              txResponse = await lottoGameConnectedContract.bet(betAmount)
              await txResponse.wait(blockConfirmations)
              console.log("Bettor bet placed (real bet).")
              console.log("All bets placed.")
              console.log("")

              // balances
              const countBettorsDuring = await lottoGame.getCountBettors()
              const deployerBalanceDuringFBT = await freeBetToken.balanceOf(
                  deployer.address
              )
              const deployerBalanceDuringUSD = await mockUSDC.balanceOf(
                  deployer.address
              )
              const bettorBalanceDuring = await mockUSDC.balanceOf(
                  bettor.address
              )
              const contractBalanceDuring = await lottoGame.getBalance()
              const freeBetContractBalanceDuring = await mockUSDC.balanceOf(
                  freeBetContract.address
              )
              console.log("count bettors:", countBettorsDuring.toString())
              console.log(
                  "deployer balance (fUSD): ",
                  deployerBalanceDuringFBT.toString()
              )
              console.log(
                  "deployer balance (mUSDC):",
                  deployerBalanceDuringUSD.toString()
              )
              console.log(
                  "bettor balance (mUSDC):  ",
                  bettorBalanceDuring.toString()
              )
              console.log(
                  "contract balance (mUSDC):",
                  contractBalanceDuring.toString()
              )
              console.log(
                  "FreebetC balance (mUSDC):",
                  freeBetContractBalanceDuring.toString()
              )
              console.log("")

              // settle round
              await new Promise(async (resolve, reject) => {
                  await lottoGame.once("RoundSettled", async () => {
                      try {
                          console.log("Bet settled!")
                          console.log(
                              `Seconds to settle: ${
                                  (new Date().getTime() - now) / 1000
                              }`
                          )
                          console.log("")
                      } catch (e) {
                          reject(e)
                      }
                      resolve()
                  })
                  // setup
                  console.log("Requesting...")
                  txResponse = await lottoGame.requestRandomWords()
                  await txResponse.wait(blockConfirmations)
                  console.log("Request sent.")
                  console.log("")

                  const now = new Date().getTime()
                  console.log("Awaiting response...")
              })

              // get balances
              const contractEndBalance = await lottoGame.getBalance()
              const deployerEndBalanceFBT = await freeBetToken.balanceOf(
                  deployer.address
              )
              const deployerEndBalanceUSD = await mockUSDC.balanceOf(
                  deployer.address
              )
              const bettorEndBalance = await mockUSDC.balanceOf(bettor.address)
              const freeBetContractEndBalance = await mockUSDC.balanceOf(
                  freeBetContract.address
              )
              console.log(
                  "Deployer end balance (fUSD): ",
                  deployerEndBalanceFBT.toString()
              )
              console.log(
                  "Deployer end balance (mUSDC):",
                  deployerEndBalanceUSD.toString()
              )
              console.log(
                  "Bettor end balance (mUSDC):  ",
                  bettorEndBalance.toString()
              )
              console.log(
                  "Contract end balance (mUSDC):",
                  contractEndBalance.toString()
              )
              console.log(
                  "FreeBetC end balance (mUSDC):",
                  freeBetContractEndBalance.toString()
              )
              console.log("")

              // assert
              // (we do not know which account will win)
              assert.equal(contractEndBalance.toString(), "0")
              assert.equal(
                  deployerEndBalanceUSD.toString(),
                  deployerStartBalanceUSD.toString()
              )
              assert(
                  deployerEndBalanceFBT.toString() ==
                      deployerStartBalanceFBT.sub(betAmount).toString() ||
                      deployerEndBalanceFBT.toString() ==
                          deployerStartBalanceFBT.add(betAmount).toString()
              )
              assert(
                  bettorEndBalance.toString() ==
                      bettorStartBalance.sub(betAmount).toString() ||
                      bettorEndBalance.toString() ==
                          bettorStartBalance.add(betAmount).toString()
              )
              const betRequirementProgressEnd =
                  await freeBetContract.betRequirementProgress(deployer.address)
              const betRequirementTotalEnd =
                  await freeBetContract.betRequirementTotal(deployer.address)
              assert.equal(betRequirementProgressStart.toString(), "0")
              assert.equal(
                  betRequirementProgressEnd.toString(),
                  betAmount.toString()
              )
              assert.equal(
                  betRequirementTotalEnd.toString(),
                  betRequirementTotalStart.toString()
              )
              assert.equal(
                  betRequirementTotalEnd.toString(),
                  (await freeBetContract.getBetRequirementCoefficient())
                      .mul(betAmount)
                      .toString()
              )

              // withdraw funds from freeBetContract
              txResponse = await freeBetContract.withdrawFbt()
              await txResponse.wait(blockConfirmations)
              txResponse = await freeBetContract.withdrawUsdc()
              await txResponse.wait(blockConfirmations)

              console.log("Done!")
              console.log("--------------------")
          })
      })
