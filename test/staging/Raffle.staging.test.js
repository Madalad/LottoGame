const { assert } = require("chai")
const { ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle staging tests", async function () {
          let deployer
          let bettor
          let raffle
          let raffleAddress = "0xe479D8d4db75214b2699959d18fB3Aa0c4637158"
          let mockUSDC
          let usdcAddress = network.config.usdcAddress
          const betAmount = 5 * 10 ** 6 // $5

          beforeEach(async function () {
              const accounts = await ethers.getSigners()
              deployer = accounts[0]
              bettor = accounts[1]

              const RaffleFactory = await ethers.getContractFactory("Raffle")
              raffle = RaffleFactory.attach(raffleAddress)
              const MockUSDCFactory = await ethers.getContractFactory(
                  "MockUSDC"
              )
              mockUSDC = MockUSDCFactory.attach(usdcAddress)

              console.log("")
              console.log("Raffle contract address:", raffleAddress)
              console.log("mUSDC address:          ", usdcAddress)
              console.log("")
          })
          it("should accept bets and decide a winner", async function () {
              const deployerStartBalance = await mockUSDC.balanceOf(
                  deployer.address
              )
              const bettorStartBalance = await mockUSDC.balanceOf(
                  bettor.address
              )
              const contractStartBalance = await raffle.getBalance()
              console.log(
                  "Deployer start balance:",
                  deployerStartBalance.toString()
              )
              console.log(
                  "Bettor start balance:  ",
                  bettorStartBalance.toString()
              )
              console.log(
                  "Contract start balance:",
                  contractStartBalance.toString()
              )
              console.log("")

              /*console.log("Allowances:")
              console.log(
                  "deployer:",
                  (
                      await mockUSDC.allowance(deployer.address, raffle.address)
                  ).toString()
              )
              console.log(
                  "bettor  :",
                  (
                      await mockUSDC.allowance(bettor.address, raffle.address)
                  ).toString()
              )*/

              console.log("owner:", (await raffle.getOwner()).toString())
              console.log("")

              console.log("Betting...")
              let txResponse
              console.log("betAmount =", betAmount.toString())
              // place deployer bet
              txResponse = await mockUSDC.approve(raffle.address, betAmount * 2)
              await txResponse.wait(1)
              console.log("approved.")
              console.log(
                  "deployer allowance:",
                  (
                      await mockUSDC.allowance(deployer.address, raffle.address)
                  ).toString()
              )
              await raffle.bet(betAmount)
              console.log("Deployer bet placed.")
              // place bettor bet
              const mockUSDCConnectedContract = await mockUSDC.connect(bettor)
              console.log("mockUSD contract connected")
              txResponse = await mockUSDCConnectedContract.approve(
                  raffle.address,
                  betAmount * 2
              )
              await txResponse.wait(1)
              console.log("approved")
              console.log(
                  "bettor allowance:",
                  (
                      await mockUSDC.allowance(bettor.address, raffle.address)
                  ).toString()
              )
              const raffleConnectedContract = await raffle.connect(bettor)
              await raffleConnectedContract.bet(betAmount)
              console.log("Bettor bet placed.")
              console.log("All bets placed.")
              console.log("")
              //console.log("skipping bets")

              console.log(
                  "count bettors:",
                  (await raffle.getCountBettors()).toString()
              )
              console.log(
                  "deployer balance:",
                  (await mockUSDC.balanceOf(deployer.address)).toString()
              )
              console.log(
                  "bettor balance:",
                  (await mockUSDC.balanceOf(bettor.address)).toString()
              )
              console.log(
                  "contract balance:",
                  (await raffle.getBalance()).toString()
              )
              console.log("")

              // request random number
              console.log("Requesting...")
              txResponse = await raffle.requestRandomWords()
              await txResponse.wait(1)
              console.log("Random words request sent.")
              console.log("")

              // wait for response
              console.log("Awaiting response...")
              let countBettors = await raffle.getCountBettors()
              while (countBettors > 0) {
                  countBettors = await raffle.getCountBettors()
              }
              console.log("Bet settled!")
              console.log("")

              // assert
              const contractEndBalance = await raffle.getBalance()
              const deployerEndBalance = await mockUSDC.balanceOf(
                  deployer.address
              )
              const bettorEndBalance = await mockUSDC.balanceOf(bettor.address)
              console.log(
                  "Deployer end balance:",
                  deployerEndBalance.toString()
              )
              console.log("Bettor end balance:  ", bettorEndBalance.toString())
              console.log(
                  "Contract end balance:",
                  contractEndBalance.toString()
              )

              assert.equal(contractEndBalance.toString(), "0")
              assert(
                  deployerStartBalance.toString() ==
                      deployerEndBalance.add(betAmount).toString() ||
                      deployerStartBalance.toString() ==
                          deployerEndBalance.sub(betAmount).toString()
              )
              console.log("Done!")
          })
      })
