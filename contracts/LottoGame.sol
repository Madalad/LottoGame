// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

error LottoGame__InsufficientBetAmount();
error LottoGame__BettingIsClosed();
error LottoGame__NoBetsToSettle();


/** @title A raffle style ERC20 gambling game
 * @author OllieM26
 * @dev This contract implements chainlink oracles to achieve verifiable randomness
 */
contract LottoGame is VRFConsumerBaseV2 {

    ERC20 public USDc;

    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    address private immutable i_coordinatorAddress;
    bytes32 private immutable i_keyHash;
    uint64 private immutable i_subscriptionId;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant CALLBACK_GAS_LIMIT = 500000;
    uint32 private constant NUM_WORDS = 1;
    address private s_vaultAddress;

    address private immutable i_owner;
    bool private s_acceptingBets;
    uint16 private s_rake;
    address private s_recentWinner;

    struct Bet {
        address bettor;
        uint256 betAmount;
    }
    Bet[] private s_unsettledBets;

    event BetAccepted(
        uint256 blockTimestamp,
        uint256 indexed blockNumber,
        address indexed bettor,
        uint256 indexed betAmount
    );
    event RandomWordsRequested(
        uint256 indexed requestId
    );
    event RoundSettled(
        uint256 blockTimestamp,
        uint256 indexed blockNumber,
        uint256 indexed potAmount,
        address indexed winner,
        uint256 winningBet,
        uint256 countParticipants
    );
    event BetsRefunded(
        uint256 blockTimestamp,
        uint256 indexed blockNumber,
        uint256 indexed countParticipants,
        uint256 indexed totalRefunded
    );

    constructor(
        uint64 _subscriptionId,
        bytes32 _keyHash,
        address _coordinatorAddress,
        address _USDCAddress,
        address _vaultAddress
        ) VRFConsumerBaseV2(_coordinatorAddress) {
            USDc = ERC20(_USDCAddress);
            i_vrfCoordinator = VRFCoordinatorV2Interface(_coordinatorAddress);
            i_coordinatorAddress = _coordinatorAddress;
            i_owner = msg.sender;
            i_subscriptionId = _subscriptionId;
            i_keyHash = _keyHash;
            s_vaultAddress = _vaultAddress;
            s_acceptingBets = true;
            s_rake = 0;
    }
    
    modifier onlyOwner {
        require(msg.sender == i_owner, "Only the owner can call this function.");
        _;
    }

    /**
     * @notice Requests a random number from the VRF coordinator
     * @dev Will revert if subscription is not set and funded.
     */
    function requestRandomWords() external onlyOwner {
        if (s_unsettledBets.length == 0) {revert LottoGame__NoBetsToSettle();}
        s_acceptingBets = false;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_keyHash,
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            CALLBACK_GAS_LIMIT,
            NUM_WORDS
        );
        emit RandomWordsRequested(requestId);
    }

    /**
     * @notice This function is called once the random number is acquired
     */
    function fulfillRandomWords(
        uint256, /* requestId */
        uint256[] memory randomWords
    ) internal override {
        settleRound(randomWords[0]);
    }

    /**
     * @notice Picks a winner using the random number and resets state variables
     *
     * @param _randomWord the random number received from the VRF coordinator
     */
    function settleRound(uint256 _randomWord) internal {
        Bet[] memory unsettledBets = s_unsettledBets;
        uint256 countBettors = unsettledBets.length;
        //if (countBettors > 0) {
        uint256 potAmount = USDc.balanceOf(address(this));
        uint256 randomNumber = _randomWord % potAmount;
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
        USDc.transfer(winner, potAmount * (10000 - s_rake) / 10000);
        USDc.transfer(s_vaultAddress, USDc.balanceOf(address(this)));
        s_recentWinner = winner;
        delete s_unsettledBets;
        emit RoundSettled(
            block.timestamp,
            block.number,
            potAmount,
            winner,
            winningBet,
            countBettors
        );
        //}
        s_acceptingBets = true;
    }
    

    /**
     * @notice Requests a random number from the VRF coordinator
     * @notice User must approve this contract address to spend their USDc
     */
    function bet(uint256 _betAmount) external {
        if (!s_acceptingBets) {revert LottoGame__BettingIsClosed();}
        if (_betAmount == 0) {revert LottoGame__InsufficientBetAmount();}

        USDc.transferFrom(msg.sender, address(this), _betAmount);
        s_unsettledBets.push(Bet(msg.sender, _betAmount));
        emit BetAccepted(
            block.timestamp,
            block.number,
            msg.sender,
            _betAmount
        );
    }

    /**
     * @notice Empties unsettledBets array and refunds user's USDc
     */
    function refundBets() public onlyOwner {
        Bet[] memory unsettledBets = s_unsettledBets;
        uint256 length = unsettledBets.length;
        uint256 totalUSDc;
        for (uint i=0; i<length; i++) {
            Bet memory currentBet = unsettledBets[i];
            USDc.transfer(currentBet.bettor, currentBet.betAmount);
            totalUSDc += currentBet.betAmount;
        }
        
        delete s_unsettledBets;
        s_acceptingBets = true;
        emit BetsRefunded(
            block.timestamp,
            block.number,
            length,
            totalUSDc
        );
    }

    function getCoordinatorAddress() external view returns(address) {
        return i_coordinatorAddress;
    }

    function getKeyHash() external view returns(bytes32) {
        return i_keyHash;
    }

    function getSubscriptionId() external view returns(uint256) {
        return i_subscriptionId;
    }

    function getVaultAddress() external view returns (address) {
        return s_vaultAddress;
    }

    function getRake() external view returns(uint256) {
        return s_rake;
    }

    function getAcceptingBets() external view returns(bool) {
        return s_acceptingBets;
    }

    function getBalance() external view returns(uint256) {
        return USDc.balanceOf(address(this));
    }

    function getCountBettors() external view returns(uint256) {
        return s_unsettledBets.length;
    }

    function getRecentWinner() external view returns(address) {
        return s_recentWinner;
    }

    function getUnsettledBet(uint256 _index) external view returns(Bet memory) {
        return s_unsettledBets[_index];
    }

    function setRake(uint16 _rake) external onlyOwner {
        require(_rake <= 10000, "Cannot set rake to >10000 (100%).");
        s_rake = _rake;
    }

    function setVaultAddress(address _newVaultAddress) external onlyOwner {
        s_vaultAddress = _newVaultAddress;
    }
}