const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
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
          const chainId = 31337
          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"])
              raffle = await ethers.getContract("Raffle", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract(
                  "VRFCoordinatorV2Mock",
                  deployer
              )

              const subscriptionTx =
                  await vrfCoordinatorV2Mock.createSubscription()
              const txReceipt = await subscriptionTx.wait(1)
              const fundTx = await vrfCoordinatorV2Mock.fundSubscription(
                  1,
                  ethers.utils.parseEther("1")
              )
          })
          describe("constructor", async function () {
              it("should set state variables in the constructor", async function () {
                  const coordinatorAddress = await raffle.s_coordinatorAddress()
                  const owner = await raffle.getOwner()
                  const subscriptionId = await raffle.getSubscriptionId()
                  const keyHash = await raffle.getKeyHash()
                  const acceptingBets = await raffle.getAcceptingBets()
                  assert.equal(coordinatorAddress, vrfCoordinatorV2Mock.address)
                  assert.equal(owner, deployer)
                  assert.equal(
                      subscriptionId,
                      networkConfig[chainId]["subscriptionId"]
                  )
                  assert.equal(keyHash, networkConfig[chainId]["vrfKeyHash"])
                  assert.equal(acceptingBets, true)
              })
          })
          describe("bet", async function () {
              it("should allow users to bet", async function () {
                  const accounts = await ethers.getSigners()
                  const betAmount = ethers.utils.parseEther("1")
                  await raffle.bet({ value: betAmount })
                  const raffleConnectedContract = await raffle.connect(
                      accounts[1]
                  )
                  await raffleConnectedContract.bet({ value: betAmount })
                  const raffleBalance = await raffle.getBalance()
                  assert.equal(
                      raffleBalance.toString(),
                      betAmount.mul(2).toString()
                  )
              })
              it("should revert bets of 0 ether", async function () {
                  const betAmount = ethers.utils.parseEther("0")
                  await expect(
                      raffle.bet({ value: betAmount })
                  ).to.be.revertedWith("You did not send any ether.")
              })
              it("should not accept a bet during VRF request", async function () {
                  const betAmount = ethers.utils.parseEther("1")
                  await raffle.requestRandomWords()
                  expect(raffle.bet({ value: betAmount })).to.be.revertedWith(
                      "You cannot place a bet right now."
                  )
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
          })
          describe("receive", async function () {
              it("should revert", async function () {
                  const signer = ethers.provider.getSigner(deployer)
                  expect(
                      signer.sendTransaction({
                          to: raffle.address,
                          value: ethers.utils.parseEther("1"),
                      })
                  ).to.be.revertedWith(
                      "Call the bet() function to place a bet."
                  )
              })
          })
      })
