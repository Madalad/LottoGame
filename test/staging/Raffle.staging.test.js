const { assert } = require("chai")
const { ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle staging tests", async function () {
          let deployer
          let bettor
          let raffle
          let raffleAddress = "0xf140EDC9DF5912951e2aC6051730a3803C454DeB"
          const betAmount = ethers.utils.parseEther("0.1")

          beforeEach(async function () {
              const accounts = await ethers.getSigners()
              deployer = accounts[0]
              bettor = accounts[1]

              const RaffleFactory = await ethers.getContractFactory("Raffle")
              raffle = RaffleFactory.attach(raffleAddress)
              console.log("Raffle contract address:", raffleAddress)
          })
          it("should accept bets and decide a winner", async function () {
              const deployerStartBalance = await deployer.getBalance()
              const bettorStartBalance = await bettor.getBalance()
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
              let deployerGasSpent, bettorGasSpent, txResponse, txReceipt

              const calculateGasSpend = (txReceipt) => {
                  const { gasUsed, effectiveGasPrice } = txReceipt
                  return gasUsed.mul(effectiveGasPrice)
              }

              // place bettor bet
              const raffleConnectedContract = await raffle.connect(bettor)
              await raffleConnectedContract.bet({
                  value: betAmount,
              })
              console.log("Bettor bet placed.")
              // place deployer bet
              console.log("Betting...")
              txResponse = await raffle.bet({ value: betAmount })
              txReceipt = await txResponse.wait(1)
              deployerGasSpent = calculateGasSpend(txReceipt)
              console.log("Deployer bet placed.")
              console.log("All bets placed.")

              // request random number
              console.log("Requesting...")
              txResponse = await raffle.requestRandomWords()
              txReceipt = await txResponse.wait(1)
              deployerGasSpent = deployerGasSpent.add(
                  calculateGasSpend(txReceipt)
              )
              console.log("Random words request sent.")

              // wait for response
              console.log("Awaiting response...")
              let countBettors = await raffle.getCountBettors()
              while (countBettors > 0) {
                  countBettors = await raffle.getCountBettors()
              }
              console.log("Bet settled!")

              // assert
              const contractEndBalance = await raffle.getBalance()
              const deployerEndBalance = await deployer.getBalance()
              const bettorEndBalance = await bettor.getBalance()
              console.log(
                  "Deployer end balance:",
                  deployerEndBalance.toString()
              )
              console.log("Bettor end balance:  ", bettorEndBalance.toString())
              console.log(
                  "Contract end balance:",
                  contractEndBalance.toString()
              )
              console.log("Deployer gas spent:  ", deployerGasSpent.toString())
              assert.equal(contractEndBalance.toString(), "0")
              assert(
                  deployerStartBalance.toString() ==
                      deployerEndBalance
                          .add(deployerGasSpent)
                          .add(betAmount)
                          .toString() ||
                      deployerStartBalance.toString() ==
                          deployerEndBalance
                              .add(deployerGasSpent)
                              .sub(betAmount)
                              .toString()
              )
              console.log("Done!")
          })
      })
