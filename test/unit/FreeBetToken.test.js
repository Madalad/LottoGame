const { assert } = require("chai")
const { ethers, network } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("FreeBetToken", function () {
          let freeBetToken
          beforeEach(async function () {
              const accounts = await ethers.getSigners()
              deployer = accounts[0]
              await deployments.fixture(["all"])
              freeBetToken = await ethers.getContract(
                  "FreeBetToken",
                  deployer.address
              )
          })
          it("should mint $100 to deployer", async function () {
              const deployerBalance = await freeBetToken.balanceOf(
                  deployer.address
              )
              assert.equal(
                  deployerBalance.toString(),
                  (100 * 10 ** 6).toString()
              )
          })
          it("has 6 decimals", async function () {
              const decimals = await freeBetToken.decimals()
              assert.equal(decimals.toString(), "6")
          })
      })
