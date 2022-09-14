// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./FreeBetContract.sol";

error LottoGame__InsufficientBetAmount();
error LottoGame__BettingIsClosed();
error LottoGame__NoBetsToSettle();

/** @title A raffle style ERC20 gambling game
 * @author OllieM26
 * @dev This contract implements chainlink oracles to achieve verifiable randomness
 */
contract LottoGame is VRFConsumerBaseV2, Ownable {

    ERC20 private USDc;

    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    address private immutable i_coordinatorAddress;
    bytes32 private immutable i_keyHash;
    uint64 private immutable i_subscriptionId;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant CALLBACK_GAS_LIMIT = 800000;
    uint32 private constant NUM_WORDS = 2;
    address private s_vaultAddress;

    address private s_owner;
    bool private s_acceptingBets;
    uint16 private s_rake;
    address private s_recentWinner;
    uint256 private s_potAmount;
    uint256 private s_jackpotAmount;
    uint16 private s_jackpotContribution;

    address private s_freeBetContractAddress;
    FreeBetContract private freeBetContract;

    struct Bet {
        address bettor;
        uint256 betAmount;
        bool isFreeBet;
    }
    Bet[] private s_unsettledBets;

    event BetAccepted(
        uint256 indexed blockNumber,
        address indexed bettor,
        uint256 indexed betAmount
    );
    event RandomWordsRequested(
        uint256 indexed requestId
    );
    event RoundSettled(
        uint256 indexed blockNumber,
        uint256 indexed potAmount,
        address indexed winner,
        uint256 winningBet,
        uint256 countParticipants
    );
    event BetsRefunded(
        uint256 indexed blockNumber,
        uint256 indexed countParticipants,
        uint256 indexed totalRefunded
    );
    event JackpotWon(
        uint256 indexed blockNumber,
        address indexed winner,
        uint256 jackpotSize
    );

    constructor(
        uint64 _subscriptionId,
        bytes32 _keyHash,
        address _coordinatorAddress,
        address _USDCAddress,
        address _vaultAddress,
        uint16 _rake,
        uint16 _jackpotContribution
        ) VRFConsumerBaseV2(_coordinatorAddress) {
            USDc = ERC20(_USDCAddress);
            i_vrfCoordinator = VRFCoordinatorV2Interface(_coordinatorAddress);
            i_coordinatorAddress = _coordinatorAddress;
            s_owner = msg.sender;
            i_subscriptionId = _subscriptionId;
            i_keyHash = _keyHash;
            s_vaultAddress = _vaultAddress;
            s_acceptingBets = true;
            s_rake = _rake;
            s_jackpotContribution = _jackpotContribution;
            s_potAmount = 0;
            s_jackpotAmount = 0;
    }

    /**
     * @notice Requests a random number from the VRF coordinator
     * @dev Will revert if chainlink VRF subscription is not set up and funded.
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
     * @param randomWords Array containing the random numbers (length one in this case)
     */
    function fulfillRandomWords(
        uint256, /* requestId */
        uint256[] memory randomWords
    ) internal override {
        settleRound(randomWords);
    }

    /**
     * @notice Picks a winner using the random number and resets state variables
     * @dev internal keyword is omitted for convenience during development
     * @param _randomWords the random number received from the VRF coordinator
     */
    function settleRound(uint256[] memory _randomWords) /* internal */ public {
        Bet[] memory unsettledBets = s_unsettledBets;
        uint256 countBettors = unsettledBets.length;
        uint256 potAmount = s_potAmount;
        uint256 randomNumber = _randomWords[0] % potAmount;
        uint256 totalUSDc;
        address winner;
        uint256 winningBet;
        bool isFreeBet;
        // pick winner
        for (uint i=0; i<countBettors; i++) {
            Bet memory currentBet = unsettledBets[i];
            totalUSDc += currentBet.betAmount;
            if (totalUSDc > randomNumber) {
                winner = currentBet.bettor;
                winningBet = currentBet.betAmount;
                isFreeBet = currentBet.isFreeBet;
                break;
            }
        }
        uint256 amountRaked = potAmount * s_rake / 10000;
        uint256 amountTowardsJackpot = potAmount * s_jackpotContribution / 10000;
        uint256 amountWon = potAmount - amountRaked - amountTowardsJackpot;
        // send money to winner
        if (isFreeBet) {
            USDc.transfer(s_freeBetContractAddress, amountWon);
            freeBetContract.settleRound(winner, amountWon);
        } else {
            USDc.transfer(winner, amountWon);
        }
        // send rake to vault
        USDc.transfer(s_vaultAddress, amountRaked);
        // check if winner won the jackpot
        if (checkJackpotWin(_randomWords[1])) {
            USDc.transfer(winner, s_jackpotAmount);
            emit JackpotWon(block.number, winner, s_jackpotAmount);
            s_jackpotAmount = 0;
        }
        // reset state variables
        s_recentWinner = winner;
        delete s_unsettledBets;
        s_jackpotAmount += amountTowardsJackpot;
        s_potAmount = 0;
        s_acceptingBets = true;
        // trigger event
        emit RoundSettled(
            block.number,
            potAmount,
            winner,
            winningBet,
            countBettors
        );
    }

    /**
     * @notice Determines whether the jackpot was won
     * @dev Called only during the settleRound() function
     *      Internal keyword omitted during development for convenience
     * @param _randomWord One of the random numbers returned from the Chainlink VRF
     */
    function checkJackpotWin(uint256 _randomWord) /* internal */ public pure returns(bool isJackpotWinner) {
        isJackpotWinner = _randomWord % 10000 == 0;  // 0.01%
    }

    /**
     * @notice Requests a random number from the VRF coordinator
     * @dev User must approve this contract address to spend their USDc
     * @param _betAmount Amount of USDC to bet
     */
    function bet(uint256 _betAmount) external {
        if (!s_acceptingBets) {revert LottoGame__BettingIsClosed();}
        if (_betAmount == 0) {revert LottoGame__InsufficientBetAmount();}

        USDc.transferFrom(msg.sender, address(this), _betAmount);
        s_unsettledBets.push(Bet(msg.sender, _betAmount, false));
        s_potAmount += _betAmount;
        emit BetAccepted(
            block.number,
            msg.sender,
            _betAmount
        );
    }

    /**
     * @notice Bet function to be called only by the external smart contract handling free bet 
     *         tokens (FreeBetContract.sol)
     * @dev This other smart contract holds real USDC and accepts free bet tokens to place real
     *      money bets on the users behalf
     *      The address of this other contract must be set after deployment using the setter
     *      method setFreeBetContractAddress(), otherwise it will revert
     * @param _betAmount Amount to bet
     * @param _bettor User who placed the free bet
     */
    function freeBet(uint256 _betAmount, address _bettor) external {
        require(msg.sender == s_freeBetContractAddress, "You cannot call this function.");
        if (!s_acceptingBets) {revert LottoGame__BettingIsClosed();}
        if (_betAmount == 0) {revert LottoGame__InsufficientBetAmount();}

        USDc.transferFrom(msg.sender, address(this), _betAmount);
        s_unsettledBets.push(Bet(_bettor, _betAmount, true));
        s_potAmount += _betAmount;
        emit BetAccepted(
            block.number,
            _bettor,
            _betAmount
        );
    }

    /**
     * @notice Empties unsettledBets array and refunds user's USDc
     * @dev For free bets, it refunds FreeBetContract with the USDC then makes a call
     *      to refundFreeBet() for it to refund the user their FBT
     */
    function refundBets() public onlyOwner {
        Bet[] memory unsettledBets = s_unsettledBets;
        uint256 length = unsettledBets.length;
        uint256 totalUSDc;
        for (uint i=0; i<length; i++) {
            Bet memory currentBet = unsettledBets[i];
            address bettor = currentBet.bettor;
            uint256 betAmount = currentBet.betAmount;
            if (currentBet.isFreeBet) {
                USDc.transfer(address(freeBetContract), betAmount);
                freeBetContract.refundFreeBet(bettor, betAmount);
            } else {
                USDc.transfer(bettor, betAmount);
            }
            totalUSDc += betAmount;
        }
        
        delete s_unsettledBets;
        s_acceptingBets = true;
        emit BetsRefunded(
            block.number,
            length,
            totalUSDc
        );
    }

    function addToJackpot(uint256 _amountToAdd) external {
        USDc.transferFrom(msg.sender, address(this), _amountToAdd);
        s_jackpotAmount += _amountToAdd;
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

    function getAllowance() public view returns (uint256) {
        return USDc.allowance(msg.sender, address(this));
    }

    function getFreeBetContractAddress() public view returns (address) {
        return s_freeBetContractAddress;
    }

    function getPotAmount() public view returns (uint256) {
        return s_potAmount;
    }

    function getJackpotAmount() public view returns (uint256) {
        return s_jackpotAmount;
    }

    function getJackpotContribution() public view returns (uint16) {
        return s_jackpotContribution;
    }

    function setRake(uint16 _rake) external onlyOwner {
        require(_rake + s_jackpotContribution <= 10000, "Rake + jackpot contribution exceeds 100%.");
        s_rake = _rake;
    }

    function setVaultAddress(address _newVaultAddress) external onlyOwner {
        s_vaultAddress = _newVaultAddress;
    }

    function setFreeBetContractAddress(address _newFreeBetContractAddress) external onlyOwner {
        s_freeBetContractAddress = _newFreeBetContractAddress;
        freeBetContract = FreeBetContract(_newFreeBetContractAddress);
    }

    function setJackpotContribution(uint16 _newJackpotContribution) external onlyOwner {
        require(s_rake + _newJackpotContribution <= 10000, "Rake + jackpot contribution exceeds 100%.");
        s_jackpotContribution = _newJackpotContribution;
    }
}