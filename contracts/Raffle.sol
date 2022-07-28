// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

error Raffle__InsufficientBetAmount();
error Raffle__BettingIsClosed();


/** @title A raffle style ERC20 gambling game
 * @author OllieM26
 * @dev This contract implements chainlink oracles to achieve verifiable randomness
 */
contract Raffle is VRFConsumerBaseV2 {

    ERC20 public USDc;

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
    Bet[] public s_unsettledBets;

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
        address _vrfCoordinator,
        address _USDCAddress
        ) VRFConsumerBaseV2(_vrfCoordinator) {
            USDc = ERC20(_USDCAddress);
            COORDINATOR = VRFCoordinatorV2Interface(_vrfCoordinator);
            s_coordinatorAddress = address(COORDINATOR);
            s_owner = msg.sender;
            s_subscriptionId = _subscriptionId;
            s_keyHash = _keyHash;
            s_acceptingBets = true;
    }
    
    modifier onlyOwner {
        require(msg.sender == s_owner, "Only the owner can call this function.");
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
        settleRound();
    }

    function settleRound() internal {
        Bet[] memory unsettledBets = s_unsettledBets;
        uint256 countBettors = unsettledBets.length;
        if (countBettors > 0) {
            uint256 latestRandomWord = s_latestRandomWord;
            uint256 potAmount = USDc.balanceOf(address(this));
            uint256 randomNumber = latestRandomWord % potAmount;
            uint256 totalUSDc;
            address winner;
            uint256 winningBet;
            for (uint i=0; i<countBettors; i++) {
                Bet memory currentBet = unsettledBets[i];
                totalUSDc += currentBet.betAmount;
                if (totalUSDc > randomNumber) {
                    winner = currentBet.bettor;
                    winningBet = currentBet.betAmount;
                    break;
                }
            }
            USDc.transfer(winner, potAmount);
            delete s_unsettledBets;
            emit RoundSettled(
                block.timestamp,
                block.number,
                potAmount,
                winner,
                winningBet,
                countBettors
            );
        }
        s_acceptingBets = true;
    }

    // User must approve this contract to spend their USDc
    function bet(uint256 _betAmount) public {
        if (!s_acceptingBets) {revert Raffle__BettingIsClosed();}
        if (_betAmount == 0) {revert Raffle__InsufficientBetAmount();}

        USDc.transferFrom(msg.sender, address(this), _betAmount);
        s_unsettledBets.push(Bet(msg.sender, _betAmount));
        emit BetAccepted(
            block.timestamp,
            block.number,
            msg.sender,
            _betAmount
        );
    }

    function getAllowance() public view returns (uint256) {
        return USDc.allowance(msg.sender, address(this));
    }

    function refundBets() public onlyOwner {
        Bet[] memory unsettledBets = s_unsettledBets;
        uint256 length = unsettledBets.length;
        for (uint i=0; i<length; i++) {
            Bet memory currentBet = unsettledBets[i];
            USDc.transfer(currentBet.bettor, currentBet.betAmount);
        }
        delete s_unsettledBets;
        s_acceptingBets = true;
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
        return USDc.balanceOf(address(this));
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

    function setCoordinator(address _coordinatorAddress) external onlyOwner {
        COORDINATOR = VRFCoordinatorV2Interface(_coordinatorAddress);
        s_coordinatorAddress = _coordinatorAddress;
    }

    receive() external payable {
        require(false, "Call the bet() function to place a bet.");
    }
}