import chai, { expect } from "chai";
import { ethers, waffle } from "hardhat";
import { MockContract, solidity } from "ethereum-waffle";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import ERC20Artifact from "../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json";
import AelinDealArtifact from "../../artifacts/contracts/AelinDeal.sol/AelinDeal.json";
import { AelinDeal } from "../../typechain";

const { deployContract, deployMockContract } = waffle;

chai.use(solidity);

describe("AelinDeal", function () {
  let deployer: SignerWithAddress;
  let sponsor: SignerWithAddress;
  let holder: SignerWithAddress;
  let purchaser: SignerWithAddress;
  let aelinDeal: AelinDeal;
  let purchaseToken: MockContract;
  let underlyingDealToken: MockContract;

  const purchaseTokenDecimals = 6;
  const underlyingDealTokenDecimals = 8;
  const oneSecond = 1;
  const name = "TestName";
  const symbol = "TestSymbol";
  const underlyingBaseAmount = 100;
  const underlyingDealTokenTotal = ethers.utils.parseUnits(
    underlyingBaseAmount.toString(),
    underlyingDealTokenDecimals
  );
  // 50:1 ratio purchase to underlying deal token
  const purchaseBaseAmount = 50;
  const dealPurchaseTokenTotal = ethers.utils.parseUnits(
    purchaseBaseAmount.toString(),
    purchaseTokenDecimals
  );

  const vestingPeriod = oneSecond * 2;
  const vestingCliff = oneSecond * 2;
  const redemptionPeriod = oneSecond * 4;
  // same logic as the convertUnderlyingToAelinAmount method
  const poolTokenMaxPurchaseAmount = dealPurchaseTokenTotal.mul(
    Math.pow(10, 18 - purchaseTokenDecimals)
  );
  const underlyingPerPurchaseExchangeRate =
    underlyingBaseAmount / purchaseBaseAmount;

  // (100 * 10^8) / (50 * 10^18) * (10^18)
  const underlyingPerPoolExchangeRate = (
    ((100 * Math.pow(10, 8)) / (50 * Math.pow(10, 18))) *
    Math.pow(10, 18)
  ).toString();

  const nullAddress = "0x0000000000000000000000000000000000000000";

  before(async () => {
    [deployer, sponsor, holder, purchaser] = await ethers.getSigners();
    purchaseToken = await deployMockContract(deployer, ERC20Artifact.abi);
    underlyingDealToken = await deployMockContract(deployer, ERC20Artifact.abi);
    await purchaseToken.mock.decimals.returns(purchaseTokenDecimals);
    await underlyingDealToken.mock.decimals.returns(
      underlyingDealTokenDecimals
    );
  });

  beforeEach(async () => {
    aelinDeal = (await deployContract(sponsor, AelinDealArtifact)) as AelinDeal;
  });

  const successfullyInitializeDeal = () =>
    aelinDeal
      .connect(deployer)
      .initialize(
        name,
        symbol,
        underlyingDealToken.address,
        underlyingPerPurchaseExchangeRate,
        underlyingDealTokenTotal,
        vestingPeriod,
        vestingCliff,
        redemptionPeriod,
        holder.address,
        poolTokenMaxPurchaseAmount
      );

  describe("initialize", function () {
    it("should successfully initialize", async function () {
      const tx = await successfullyInitializeDeal();

      // TODO test the aelinDeal.AELIN_POOL() variable
      expect(await aelinDeal.name()).to.equal(`aeDeal-${name}`);
      expect(await aelinDeal.symbol()).to.equal(`aeD-${symbol}`);
      expect(await aelinDeal.HOLDER()).to.equal(holder.address);
      expect(await aelinDeal.UNDERLYING_DEAL_TOKEN()).to.equal(
        underlyingDealToken.address
      );
      expect(await aelinDeal.AELIN_POOL_ADDRESS()).to.equal(deployer.address);
      expect(await aelinDeal.UNDERLYING_DEAL_TOKEN()).to.equal(
        underlyingDealToken.address
      );
      expect(await aelinDeal.UNDERLYING_DEAL_TOKEN_DECIMALS()).to.equal(
        underlyingDealTokenDecimals
      );
      const { timestamp } = await ethers.provider.getBlock(tx.blockHash!);
      expect(await aelinDeal.UNDERLYING_DEAL_TOKENS_TOTAL()).to.equal(
        underlyingDealTokenTotal.toString()
      );
      const actualVestingCliff = timestamp + redemptionPeriod + vestingCliff;
      expect(await aelinDeal.VESTING_CLIFF()).to.equal(actualVestingCliff);
      expect(await aelinDeal.VESTING_PERIOD()).to.equal(vestingPeriod);
      expect(await aelinDeal.VESTING_EXPIRY()).to.equal(
        actualVestingCliff + vestingPeriod
      );
      expect(await aelinDeal.REDEMPTION_PERIOD()).to.equal(redemptionPeriod);
      expect(await aelinDeal.UNDERLYING_PER_PURCHASE_EXCHANGE_RATE()).to.equal(
        underlyingPerPurchaseExchangeRate
      );
      expect(await aelinDeal.UNDERLYING_PER_POOL_EXCHANGE_RATE()).to.equal(
        underlyingPerPoolExchangeRate
      );
    });

    it("should only allow initialization once", async function () {
      await successfullyInitializeDeal();
      await expect(successfullyInitializeDeal()).to.be.revertedWith(
        "can only initialize once"
      );
    });
  });

  describe("depositUnderlying", function () {
    beforeEach(async () => {
      await underlyingDealToken.mock.balanceOf
        .withArgs(holder.address)
        .returns(underlyingDealTokenTotal);

      await underlyingDealToken.mock.transferFrom
        .withArgs(holder.address, aelinDeal.address, underlyingDealTokenTotal)
        .returns(true);

      await underlyingDealToken.mock.balanceOf
        .withArgs(aelinDeal.address)
        .returns(underlyingDealTokenTotal);

      await successfullyInitializeDeal();
    });

    it("should complete the deposit when the total amount has been reached", async function () {
      expect(await aelinDeal.DEPOSIT_COMPLETE()).to.equal(false);

      const tx = await aelinDeal
        .connect(holder)
        .depositUnderlying(underlyingDealTokenTotal);

      expect(await aelinDeal.DEPOSIT_COMPLETE()).to.equal(true);

      const { timestamp } = await ethers.provider.getBlock(tx.blockHash!);

      const [depositDealTokensLog] = await aelinDeal.queryFilter(
        aelinDeal.filters.DepositDealTokens()
      );
      const [dealFundedLog] = await aelinDeal.queryFilter(
        aelinDeal.filters.DealFullyFunded()
      );
      expect(depositDealTokensLog.args.underlyingDealTokenAddress).to.equal(
        underlyingDealToken.address
      );
      expect(depositDealTokensLog.args.depositor).to.equal(holder.address);
      expect(depositDealTokensLog.args.dealContract).to.equal(
        aelinDeal.address
      );
      expect(depositDealTokensLog.args.underlyingDealTokenAmount).to.equal(
        underlyingDealTokenTotal
      );

      expect(dealFundedLog.args.dealAddress).to.equal(aelinDeal.address);
      expect(dealFundedLog.args.poolAddress).to.be.properAddress;
      expect(dealFundedLog.args.redemptionStart).to.equal(timestamp);
      expect(dealFundedLog.args.redemptionExpiry).to.equal(
        timestamp + redemptionPeriod
      );
    });

    it("should revert once the deposit amount has already been reached", async function () {
      await aelinDeal
        .connect(holder)
        .depositUnderlying(underlyingDealTokenTotal);

      await expect(
        aelinDeal.connect(holder).depositUnderlying(underlyingDealTokenTotal)
      ).to.be.revertedWith("deposit already complete");
    });

    it("should not finalize the deposit if the total amount has not been deposited", async function () {
      expect(await aelinDeal.DEPOSIT_COMPLETE()).to.equal(false);
      const lowerAmount = underlyingDealTokenTotal.sub(1);
      await underlyingDealToken.mock.balanceOf
        .withArgs(holder.address)
        .returns(lowerAmount);

      await underlyingDealToken.mock.transferFrom
        .withArgs(holder.address, aelinDeal.address, lowerAmount)
        .returns(true);

      await underlyingDealToken.mock.balanceOf
        .withArgs(aelinDeal.address)
        .returns(ethers.BigNumber.from(0));

      await aelinDeal.connect(holder).depositUnderlying(lowerAmount);

      expect(await aelinDeal.DEPOSIT_COMPLETE()).to.equal(false);

      const [depositDealTokensLog] = await aelinDeal.queryFilter(
        aelinDeal.filters.DepositDealTokens()
      );

      expect(depositDealTokensLog.args.underlyingDealTokenAddress).to.equal(
        underlyingDealToken.address
      );
      expect(depositDealTokensLog.args.depositor).to.equal(holder.address);
      expect(depositDealTokensLog.args.dealContract).to.equal(
        aelinDeal.address
      );
      expect(depositDealTokensLog.args.underlyingDealTokenAmount).to.equal(
        lowerAmount
      );

      const dealFullyFundedLogs = await aelinDeal.queryFilter(
        aelinDeal.filters.DealFullyFunded()
      );
      expect(dealFullyFundedLogs.length).to.equal(0);
    });
  });

  describe("mint", function () {
    beforeEach(async () => {
      await successfullyInitializeDeal();
    });

    it("should mint tokens", async function () {
      expect(await aelinDeal.totalSupply()).to.equal(ethers.BigNumber.from(0));
      const mintAmount = ethers.utils.parseUnits("1", purchaseTokenDecimals);
      await aelinDeal.connect(deployer).mint(purchaser.address, mintAmount);
      expect(await aelinDeal.totalSupply()).to.equal(mintAmount);
      expect(await aelinDeal.balanceOf(purchaser.address)).to.equal(mintAmount);
      const [mintLog] = await aelinDeal.queryFilter(
        aelinDeal.filters.MintDealTokens()
      );
      expect(mintLog.args.dealContract).to.equal(aelinDeal.address);
      expect(mintLog.args.recipient).to.equal(purchaser.address);
      expect(mintLog.args.dealTokenAmount).to.equal(mintAmount);
    });

    it("should not allow mint tokens for the wrong account (only the deployer which is enforced as the pool)", async function () {
      await expect(
        aelinDeal
          .connect(holder)
          .mint(
            purchaser.address,
            ethers.utils.parseUnits("1", purchaseTokenDecimals)
          )
      ).to.be.revertedWith("only AelinPool can access");
    });
  });

  describe("withdraw", function () {
    const excessAmount = ethers.utils.parseUnits(
      "10",
      underlyingDealTokenDecimals
    );
    beforeEach(async () => {
      await successfullyInitializeDeal();
    });

    it("should allow the holder to withdraw excess tokens from the pool", async function () {
      await underlyingDealToken.mock.balanceOf
        .withArgs(aelinDeal.address)
        .returns(underlyingDealTokenTotal.add(excessAmount));

      await underlyingDealToken.mock.transfer
        .withArgs(holder.address, excessAmount)
        .returns(true);

      await aelinDeal.connect(holder).withdraw();
      const [log] = await aelinDeal.queryFilter(
        aelinDeal.filters.WithdrawUnderlyingDealTokens()
      );
      expect(log.args.underlyingDealTokenAddress).to.equal(
        underlyingDealToken.address
      );
      expect(log.args.depositor).to.equal(holder.address);
      expect(log.args.dealContract).to.equal(aelinDeal.address);
      expect(log.args.underlyingDealTokenAmount).to.equal(excessAmount);
    });

    it("should block anyone else from withdrawing excess tokens from the pool", async function () {
      await expect(aelinDeal.connect(deployer).withdraw()).to.be.revertedWith(
        "only holder can access"
      );
    });

    it("should block the holder from withdrawing when there are no excess tokens in the pool", async function () {
      await underlyingDealToken.mock.transfer
        .withArgs(holder.address, excessAmount)
        .returns(true);

      await underlyingDealToken.mock.balanceOf
        .withArgs(aelinDeal.address)
        .returns(underlyingDealTokenTotal.sub(excessAmount));
      try {
        await aelinDeal.connect(holder).withdraw();
      } catch (e: any) {
        expect(e.message).to.equal(
          "VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)"
        );
      }
    });
  });

  const mintAmount = ethers.utils.parseUnits("1000", purchaseTokenDecimals);
  const remainingBalance = underlyingDealTokenTotal.sub(mintAmount);
  const fundMintAndExpireDeal = async () => {
    await underlyingDealToken.mock.balanceOf
      .withArgs(holder.address)
      .returns(underlyingDealTokenTotal);

    await underlyingDealToken.mock.transferFrom
      .withArgs(holder.address, aelinDeal.address, underlyingDealTokenTotal)
      .returns(true);

    await underlyingDealToken.mock.balanceOf
      .withArgs(aelinDeal.address)
      .returns(underlyingDealTokenTotal);

    await aelinDeal.connect(holder).depositUnderlying(underlyingDealTokenTotal);

    await aelinDeal.connect(deployer).mint(purchaser.address, mintAmount);
  };

  const timeoutToSkipRedeemWindow = async () =>
    new Promise((resolve) =>
      setTimeout(resolve, 1000 * (redemptionPeriod + 1))
    );

  describe("withdrawExpiry", function () {
    beforeEach(async () => {
      await successfullyInitializeDeal();
    });

    it("should allow the holder to withdraw excess tokens in the pool after expiry", async function () {
      await fundMintAndExpireDeal();
      // wait for redemption period to end
      await timeoutToSkipRedeemWindow();

      await underlyingDealToken.mock.balanceOf
        .withArgs(aelinDeal.address)
        .returns(remainingBalance);

      await underlyingDealToken.mock.transfer
        .withArgs(holder.address, remainingBalance)
        .returns(true);

      await aelinDeal.connect(holder).withdrawExpiry();

      const [log] = await aelinDeal.queryFilter(
        aelinDeal.filters.WithdrawUnderlyingDealTokens()
      );
      expect(log.args.underlyingDealTokenAddress).to.equal(
        underlyingDealToken.address
      );
      expect(log.args.depositor).to.equal(holder.address);
      expect(log.args.dealContract).to.equal(aelinDeal.address);
      expect(log.args.underlyingDealTokenAmount).to.equal(remainingBalance);
    });

    it("should block the holder from withdraw excess tokens in the pool before redeem window starts", async function () {
      // not funding the deal so the redeem window has not started yet
      await expect(
        aelinDeal.connect(holder).withdrawExpiry()
      ).to.be.revertedWith("redemption period not started");
    });

    it("should block the holder from withdraw excess tokens in the pool while redeem window is active", async function () {
      await fundMintAndExpireDeal();
      // no waiting for redemption period to end
      await underlyingDealToken.mock.balanceOf
        .withArgs(aelinDeal.address)
        .returns(remainingBalance);

      await underlyingDealToken.mock.transfer
        .withArgs(holder.address, remainingBalance)
        .returns(true);
      await expect(
        aelinDeal.connect(holder).withdrawExpiry()
      ).to.be.revertedWith("redeem window still active");
    });
  });

  const expectedClaim = ethers.BigNumber.from(
    (Number(underlyingPerPoolExchangeRate) * Math.pow(10, 18)) /
      mintAmount.toNumber() /
      Math.pow(10, 18 - underlyingDealTokenDecimals)
  );

  describe("claim and custom transfer", function () {
    beforeEach(async () => {
      await successfullyInitializeDeal();
    });

    it("should allow the purchaser to claim their minted tokens only once", async function () {
      await fundMintAndExpireDeal();
      // wait for redemption period and the vesting period to end
      await timeoutToSkipRedeemWindow();
      await timeoutToSkipRedeemWindow();

      await underlyingDealToken.mock.transfer
        .withArgs(purchaser.address, expectedClaim)
        .returns(true);

      await aelinDeal.connect(purchaser).claim(purchaser.address);
      const [log] = await aelinDeal.queryFilter(
        aelinDeal.filters.ClaimedUnderlyingDealTokens()
      );
      expect(log.args.underlyingDealTokenAddress).to.equal(
        underlyingDealToken.address
      );
      expect(log.args.from).to.equal(purchaser.address);
      expect(log.args.recipient).to.equal(purchaser.address);
      expect(log.args.underlyingDealTokensClaimed).to.equal(expectedClaim);

      expect(await aelinDeal.balanceOf(purchaser.address)).to.equal(0);
    });

    it("should claim their minted tokens when doing a transfer", async function () {
      await fundMintAndExpireDeal();
      // wait for redemption period and the vesting period to end
      await timeoutToSkipRedeemWindow();
      await timeoutToSkipRedeemWindow();

      await underlyingDealToken.mock.transfer
        .withArgs(purchaser.address, expectedClaim)
        .returns(true);

      await aelinDeal.connect(purchaser).transfer(deployer.address, mintAmount);

      const [claimLog] = await aelinDeal.queryFilter(
        aelinDeal.filters.ClaimedUnderlyingDealTokens()
      );
      const transferLogs = await aelinDeal.queryFilter(
        aelinDeal.filters.Transfer()
      );

      expect(claimLog.args.underlyingDealTokenAddress).to.equal(
        underlyingDealToken.address
      );
      expect(claimLog.args.from).to.equal(purchaser.address);
      expect(claimLog.args.recipient).to.equal(purchaser.address);
      expect(claimLog.args.underlyingDealTokensClaimed).to.equal(expectedClaim);

      expect(transferLogs[0].args.from).to.equal(nullAddress);
      expect(transferLogs[0].args.to).to.equal(purchaser.address);
      expect(transferLogs[0].args.amount).to.equal(mintAmount);

      expect(transferLogs[1].args.from).to.equal(purchaser.address);
      expect(transferLogs[1].args.to).to.equal(nullAddress);
      // @NOTE I thought the safeTransfer might emit an event  with the expected claim amount?
      expect(transferLogs[1].args.amount).to.equal(mintAmount);

      expect(transferLogs[2].args.from).to.equal(purchaser.address);
      expect(transferLogs[2].args.to).to.equal(deployer.address);
      expect(transferLogs[2].args.amount).to.equal(mintAmount);

      expect(await aelinDeal.balanceOf(purchaser.address)).to.equal(0);
    });

    it("should not allow a random wallet with no balance to claim", async function () {
      await fundMintAndExpireDeal();
      // wait for redemption period and the vesting period to end
      await timeoutToSkipRedeemWindow();
      await timeoutToSkipRedeemWindow();

      await underlyingDealToken.mock.transfer
        .withArgs(purchaser.address, expectedClaim)
        .returns(true);

      await aelinDeal.connect(deployer).claim(deployer.address);
      const claimedLogs = await aelinDeal.queryFilter(
        aelinDeal.filters.ClaimedUnderlyingDealTokens()
      );
      expect(claimedLogs.length).to.equal(0);
    });
  });
});
