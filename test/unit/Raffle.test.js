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
          const chainId = 31337 // hardhat localhost
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

              const subscriptionTx =
                  await vrfCoordinatorV2Mock.createSubscription()
              const txReceipt = await subscriptionTx.wait(1)
              const fundTx = await vrfCoordinatorV2Mock.fundSubscription(
                  1,
                  ethers.utils.parseEther("1")
              )
              await vrfCoordinatorV2Mock.addConsumer(
                  1, // subscriptionId
                  raffle.address
              )
          })
          describe("constructor and getters", async function () {
              it("should set state variables in the constructor", async function () {
                  const coordinatorAddress = await raffle.s_coordinatorAddress()
                  const owner = await raffle.getOwner()
                  const subscriptionId = await raffle.getSubscriptionId()
                  const keyHash = await raffle.getKeyHash()
                  const acceptingBets = await raffle.getAcceptingBets()
                  assert.equal(coordinatorAddress, vrfCoordinatorV2Mock.address)
                  assert.equal(owner, deployer.address)
                  assert.equal(
                      subscriptionId,
                      networkConfig[chainId]["subscriptionId"]
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
              it("should get correct latest random word", async function () {
                  const response = await raffle.getLatestRandomWord()
                  assert.equal(response.toString(), "0")
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
      })
