// SPDX-License-Identifier: MIT


pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";


contract Raffle is VRFConsumerBaseV2 {

    VRFCoordinatorV2Interface COORDINATOR;
    address public s_coordinatorAddress;
    bytes32 s_keyHash;
    uint256 s_requestId;
    uint64 s_subscriptionId;

    address s_owner;
    uint256 s_latestRandomWord;
    bool s_acceptingBets;

    struct Bet {
        address bettor;
        uint256 betAmount;
    }
    Bet[] s_unsettledBets;

    event BetAccepted(
        uint256 blockTimestamp,
        uint256 blockNumber,
        address bettor,
        uint256 betAmount
    );
    event RoundSettled(
        uint256 blockTimestamp,
        uint256 blockNumber,
        uint256 potAmount,
        address winner,
        uint256 winningBet,
        uint256 countParticipants
    );

    constructor(
        uint64 _subscriptionId,
        bytes32 _keyHash,
        address _vrfCoordinator
        ) VRFConsumerBaseV2(_vrfCoordinator) {
        COORDINATOR = VRFCoordinatorV2Interface(_vrfCoordinator);
        s_coordinatorAddress = address(COORDINATOR);
        s_owner = msg.sender;
        s_subscriptionId = _subscriptionId;
        s_keyHash = _keyHash;
        s_acceptingBets = true;
    }
    
    modifier onlyOwner {
        require(msg.sender == s_owner, "Only the owner can call this function!");
        _;
    }

    function requestRandomWords() external {
    // Will revert if subscription is not set and funded.
        s_acceptingBets = false;
        s_requestId = COORDINATOR.requestRandomWords(
            s_keyHash,
            s_subscriptionId,
            3, // requestConfirmations,
            100000, // callbackGasLimit
            1 // numWords
        );
    }

    function fulfillRandomWords(
        uint256, /* requestId */
        uint256[] memory randomWords
    ) internal override {
        s_latestRandomWord = randomWords[0];
        Bet[] memory unsettledBets = s_unsettledBets;
        uint256 countBettors = unsettledBets.length;
        require(countBettors > 0, "There are 0 participants.");
        uint256 latestRandomWord = randomWords[0];
        uint256 potAmount = address(this).balance;
        uint256 randomNumber = latestRandomWord % potAmount;
        uint256 countWei;
        address winner;
        uint256 winningBet;
        for (uint i=0; i<countBettors; i++) {
            Bet memory currentBet = unsettledBets[i];
            countWei += currentBet.betAmount;
            if (countWei > randomNumber) {
                winner = currentBet.bettor;
                winningBet = currentBet.betAmount;
                break;
            }
        }
        uint256 balance = address(this).balance;
        payable(winner).transfer(balance);
        delete s_unsettledBets;
        s_acceptingBets = true;
        emit RoundSettled(
            block.timestamp,
            block.number,
            balance,
            winner,
            winningBet,
            countBettors
        );
    }

    function bet() public payable {
        require(s_acceptingBets, "You cannot place a bet right now.");
        require(msg.value > 0, "You did not send any ether.");
        s_unsettledBets.push(Bet(msg.sender, msg.value));
        emit BetAccepted(
            block.timestamp,
            block.number,
            msg.sender,
            msg.value
        );
    }

    function getOwner() external view returns(address) {
        return s_owner;
    }

    function getSubscriptionId() external view onlyOwner returns(uint256) {
        return s_subscriptionId;
    }

    function getKeyHash() external view onlyOwner returns(bytes32) {
        return s_keyHash;
    }

    function getAcceptingBets() external view onlyOwner returns(bool) {
        return s_acceptingBets;
    }

    function getBalance() external view onlyOwner returns(uint256) {
        return address(this).balance;
    }

    function getBalanceEther() external view onlyOwner returns(uint256) {
        return address(this).balance/ 10**18;
    }

    function getCountBettors() external view onlyOwner returns(uint256) {
        return s_unsettledBets.length;
    }

    function getLatestRandomWord() external view onlyOwner returns(uint256) {
        return s_latestRandomWord;
    }

    function setSubscriptionId(uint64 _subscriptionId) external onlyOwner {
        s_subscriptionId = _subscriptionId;
    }

    function setKeyHash(bytes32 _keyHash) external onlyOwner {
        s_keyHash = _keyHash;
    }

    receive() external payable {
        require(false, "Call the bet() function to place a bet.");
    }
}