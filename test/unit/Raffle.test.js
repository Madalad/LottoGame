const { assert, expect } = require("chai")
const { deployments, ethers, network } = require("hardhat")
const {
    networkConfig,
    developmentChains,
} = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", async function () {
          let deployer
          let raffle
          let vrfCoordinatorV2Mock
          let mockUSDC
          const chainId = network.config.chainId
          let betAmount
          beforeEach(async function () {
              accounts = await ethers.getSigners()
              deployer = accounts[0]
              betAmount = 5 * 10 ** 6 // $5
              await deployments.fixture(["all"])
              raffle = await ethers.getContract("Raffle", deployer.address)
              vrfCoordinatorV2Mock = await ethers.getContract(
                  "VRFCoordinatorV2Mock",
                  deployer.address
              )
              mockUSDC = await ethers.getContract("MockUSDC", deployer.address)

              const subscriptionId = network.config.subscriptionId
              const subscriptionTx =
                  await vrfCoordinatorV2Mock.createSubscription()
              await subscriptionTx.wait(1)
              await vrfCoordinatorV2Mock.fundSubscription(
                  subscriptionId,
                  ethers.utils.parseEther("1")
              )
              await vrfCoordinatorV2Mock.addConsumer(1, raffle.address)
          })
          describe("constructor", async function () {
              it("should set state variables in the constructor", async function () {
                  const coordinatorAddress = await raffle.s_coordinatorAddress()
                  const owner = await raffle.getOwner()
                  const subscriptionId = await raffle.getSubscriptionId()
                  const keyHash = await raffle.getKeyHash()
                  const acceptingBets = await raffle.getAcceptingBets()
                  assert.equal(coordinatorAddress, vrfCoordinatorV2Mock.address)
                  assert.equal(owner, deployer.address)
                  assert.equal(
                      subscriptionId.toString(),
                      network.config.subscriptionId.toString()
                  )
                  assert.equal(keyHash, networkConfig[chainId]["vrfKeyHash"])
                  assert.equal(acceptingBets, true)
              })
          })
          describe("bet", async function () {
              it("should allow multiple users to bet", async function () {
                  const accounts = await ethers.getSigners()
                  const countBettors = 5

                  let bettor
                  let raffleConnectedContract
                  let mockUSDCConnectedContract
                  for (i = 0; i < countBettors; i++) {
                      bettor = accounts[i]
                      mockUSDCConnectedContract = await mockUSDC.connect(bettor)
                      await mockUSDCConnectedContract.approve(
                          raffle.address,
                          betAmount
                      )
                      await mockUSDC.transfer(bettor.address, betAmount)
                      raffleConnectedContract = await raffle.connect(bettor)
                      await raffleConnectedContract.bet(betAmount)
                  }

                  const raffleBalance = await raffle.getBalance()
                  assert.equal(raffleBalance, betAmount * countBettors)
              })
              it("should emit the appropriate event", async function () {
                  await mockUSDC.approve(raffle.address, betAmount)
                  const txResponse = await raffle.bet(betAmount)
                  const txReceipt = await txResponse.wait(1)
                  const { events } = txReceipt
                  const event = events[events.length - 1]["event"]
                  const args = events[events.length - 1]["args"]

                  assert.equal(event.toString(), "BetAccepted")
                  assert.equal(args["bettor"], deployer.address)
                  assert.equal(
                      args["betAmount"].toString(),
                      betAmount.toString()
                  )
              })
              it("should update unsettledBets array", async function () {
                  const accounts = await ethers.getSigners()
                  const countBettors = 5
                  let bettor
                  let raffleConnectedContract
                  for (i = 0; i < countBettors; i++) {
                      bettor = accounts[i]
                      // approve
                      mockUSDCConnectedContract = await mockUSDC.connect(bettor)
                      await mockUSDCConnectedContract.approve(
                          raffle.address,
                          betAmount
                      )
                      // transfer
                      await mockUSDC.transfer(bettor.address, betAmount)
                      raffleConnectedContract = await raffle.connect(bettor)
                      await raffleConnectedContract.bet(betAmount)
                  }

                  let currentBet
                  for (i = 0; i < countBettors; i++) {
                      currentBet = await raffle.s_unsettledBets(i)
                      assert.equal(
                          currentBet["betAmount"].toString(),
                          betAmount.toString()
                      )
                      assert.equal(currentBet["bettor"], accounts[i].address)
                  }
              })
              it("should revert bets of 0 ether", async function () {
                  betAmount = 0
                  await expect(
                      raffle.bet(betAmount)
                  ).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__InsufficientBetAmount"
                  )
              })
              it("should not accept a bet during VRF request", async function () {
                  await raffle.requestRandomWords()
                  expect(raffle.bet(betAmount)).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__BettingIsClosed"
                  )
              })
          })
          describe("refund", async function () {
              it("doesn't revert with no bets to refund", async function () {
                  let countBettors = await raffle.getCountBettors()
                  assert.equal(countBettors.toString(), "0")
                  await raffle.refundBets()
              })
              it("refunds two+ bets properly", async function () {
                  accounts = await ethers.getSigners()
                  bettor = accounts[1]

                  // deployer bet
                  await mockUSDC.approve(raffle.address, betAmount)
                  await raffle.bet(betAmount)
                  // bettor bet
                  mockUSDC.transfer(bettor.address, betAmount)
                  const mockUSDCConnectedContract = await mockUSDC.connect(
                      bettor
                  )
                  await mockUSDCConnectedContract.approve(
                      raffle.address,
                      betAmount
                  )
                  const raffleConnectedContract = await raffle.connect(bettor)
                  await raffleConnectedContract.bet(betAmount)

                  const deployerStartBalance = await mockUSDC.balanceOf(
                      deployer.address
                  )
                  const bettorStartBalance = await mockUSDC.balanceOf(
                      bettor.address
                  )
                  const contractStartBalance = await raffle.getBalance()
                  await raffle.refundBets()
                  const deployerEndBalance = await mockUSDC.balanceOf(
                      deployer.address
                  )
                  const bettorEndBalance = await mockUSDC.balanceOf(
                      bettor.address
                  )
                  const contractEndBalance = await raffle.getBalance()
                  const countBettors = await raffle.getCountBettors()

                  assert.equal(contractStartBalance, betAmount * 2)
                  assert.equal(contractEndBalance, 0)
                  assert.equal(
                      deployerEndBalance.toString(),
                      deployerStartBalance.add(betAmount).toString()
                  )
                  assert.equal(
                      bettorEndBalance.toString(),
                      bettorStartBalance.add(betAmount).toString()
                  )
                  assert.equal(countBettors.toString(), "0")
              })
          })
          describe("setters", async function () {
              it("should update subscriptionId", async function () {
                  const newSubscriptionId = 99
                  await raffle.setSubscriptionId(newSubscriptionId)
                  const response = await raffle.getSubscriptionId()
                  assert.equal(response, newSubscriptionId)
              })
              it("should update keyHash", async function () {
                  const newkeyHash = networkConfig[1]["vrfKeyHash"]
                  await raffle.setKeyHash(newkeyHash)
                  const response = await raffle.getKeyHash()
                  assert.equal(response, newkeyHash)
              })
              it("should update coordinator", async function () {
                  const newCoordinatorAddress =
                      networkConfig[1]["vrfCoordinatorAddress"]
                  await raffle.setCoordinator(newCoordinatorAddress)
                  const response = await raffle.s_coordinatorAddress()
                  assert.equal(response, newCoordinatorAddress)
              })
          })
          describe("getters", async function () {
              it("should get a users allowance", async function () {
                  await mockUSDC.approve(raffle.address, betAmount)
                  const allowance = await raffle.getAllowance()
                  assert.equal(allowance.toString(), betAmount.toString())
              })
          })
          describe("receive", async function () {
              it("should revert with correct error message", async function () {
                  expect(
                      deployer.sendTransaction({
                          to: raffle.address,
                          value: ethers.utils.parseEther("1"),
                      })
                  ).to.be.revertedWith(
                      "Call the bet() function to place a bet."
                  )
              })
          })
          // to run below test, settleRound() must be set from internal to public in Raffle.sol
          /*describe("settle round", async function () {
              it("should settle bets", async function () {
                  const deployerStartBalance = await mockUSDC.balanceOf(
                      deployer.address
                  )
                  // place bet
                  await mockUSDC.approve(raffle.address, betAmount)
                  await raffle.bet(betAmount)
                  // settle
                  const txResponse = await raffle.settleRound(1234567890)
                  const txReceipt = await txResponse.wait(1)
                  const { events } = txReceipt
                  const event = events[events.length - 1]["event"]
                  const args = events[events.length - 1]["args"]
                  //assert
                  const deployerEndBalance = await mockUSDC.balanceOf(
                      deployer.address
                  )
                  const contractEndBalance = await mockUSDC.balanceOf(
                      raffle.address
                  )
                  assert.equal(event.toString(), "RoundSettled")
                  assert.equal(
                      args["potAmount"].toString(),
                      betAmount.toString()
                  )
                  assert.equal(
                      args["winner"].toString(),
                      deployer.address.toString()
                  )
                  assert.equal(
                      args["winningBet"].toString(),
                      betAmount.toString()
                  )
                  assert.equal(args["countParticipants"].toString(), "1")
                  assert.equal(
                      deployerEndBalance.toString(),
                      deployerStartBalance.toString()
                  )
                  assert.equal(contractEndBalance.toString(), "0")
              })
              it("should work with 2 bettors", async function () {
                  accounts = await ethers.getSigners()
                  bettor = accounts[1]
                  const deployerStartBalance = await mockUSDC.balanceOf(
                      deployer.address
                  )
                  const bettorStartBalance = await mockUSDC.balanceOf(
                      bettor.address
                  )
                  // place bets
                  await mockUSDC.approve(raffle.address, betAmount)
                  await raffle.bet(betAmount)
                  await mockUSDC.transfer(bettor.address, betAmount)
                  const raffleConnectedContract = await raffle.connect(bettor)
                  const mockUSDCConnectedContract = await mockUSDC.connect(
                      bettor
                  )
                  await mockUSDCConnectedContract.approve(
                      raffle.address,
                      betAmount
                  )
                  await raffleConnectedContract.bet(betAmount)
                  // settle
                  const txResponse = await raffle.settleRound(1234567890) // deployer will win
                  const txReceipt = await txResponse.wait(1)
                  const { events } = txReceipt
                  const event = events[events.length - 1]["event"]
                  const args = events[events.length - 1]["args"]
                  //assert
                  const deployerEndBalance = await mockUSDC.balanceOf(
                      deployer.address
                  )
                  const bettorEndBalance = await mockUSDC.balanceOf(
                      bettor.address
                  )
                  const contractEndBalance = await mockUSDC.balanceOf(
                      raffle.address
                  )
                  assert.equal(event.toString(), "RoundSettled")
                  assert.equal(
                      args["potAmount"].toString(),
                      (betAmount * 2).toString()
                  )
                  assert.equal(
                      args["winner"].toString(),
                      deployer.address.toString()
                  )
                  assert.equal(
                      args["winningBet"].toString(),
                      betAmount.toString()
                  )
                  assert.equal(args["countParticipants"].toString(), "2")
                  assert.equal(
                      deployerEndBalance.toString(),
                      deployerStartBalance.toString()
                  )
                  assert.equal(bettorEndBalance.toString(), "0")
                  assert.equal(contractEndBalance.toString(), "0")
              })
              it("should work with rake", async function () {
                  const deployerStartBalance = await mockUSDC.balanceOf(
                      deployer.address
                  )
                  await raffle.setRake(100)
                  // place bet
                  await mockUSDC.approve(raffle.address, betAmount)
                  await raffle.bet(betAmount)
                  // settle
                  const txResponse = await raffle.settleRound(1234567890)
                  const txReceipt = await txResponse.wait(1)
                  const { events } = txReceipt
                  const event = events[events.length - 1]["event"]
                  const args = events[events.length - 1]["args"]
                  //assert
                  const deployerEndBalance = await mockUSDC.balanceOf(
                      deployer.address
                  )
                  const contractEndBalance = await mockUSDC.balanceOf(
                      raffle.address
                  )
                  assert.equal(event.toString(), "RoundSettled")
                  assert.equal(
                      args["potAmount"].toString(),
                      betAmount.toString()
                  )
                  assert.equal(
                      args["winner"].toString(),
                      deployer.address.toString()
                  )
                  assert.equal(
                      args["winningBet"].toString(),
                      betAmount.toString()
                  )
                  assert.equal(args["countParticipants"].toString(), "1")
                  assert.equal(
                      deployerEndBalance.toString(),
                      deployerStartBalance.sub(betAmount * 0.01).toString()
                  )
                  assert.equal(contractEndBalance.toString(), "0")
              })
              it("should work with 0 bettors", async function () {
                  await raffle.settleRound(1234567890)
              })
          })*/
      })
