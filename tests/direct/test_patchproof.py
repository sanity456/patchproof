import json


CONTRACT = "contracts/patchproof.py"
CHECK = "a" * 32
RELEASE = "https://example.com/releases/v2"
MIGRATION = "https://docs.example.net/migrate-v2"
USAGE = "The service imports legacy_parse to process uploaded configuration files before validation."


def create(contract):
    return contract.create_check(CHECK, "example-lib", "1.8.0", "2.0.0", USAGE, RELEASE, MIGRATION)


def mock_analysis(vm, verdict="BREAKING"):
    vm.clear_mocks()
    vm.mock_web(r"https://example\.com/releases/v2", {"status": 200, "body": "Version 2 removes legacy_parse."})
    vm.mock_web(r"https://docs\.example\.net/migrate-v2", {"status": 200, "body": "Replace legacy_parse with parse_config."})
    payload = {
        "verdict": verdict,
        "severity": "HIGH" if verdict == "BREAKING" else "NONE",
        "affected": verdict == "BREAKING",
        "release_relevant": True,
        "migration_relevant": True,
        "summary": "The used API was removed.",
        "recommended_action": "Replace the call before upgrading.",
        "citations": [{"source": "release", "passage": "removes legacy_parse", "why": "The app uses it."}],
    }
    vm.mock_llm(r".*independent software upgrade reviewer.*", json.dumps(payload))


def test_create_evaluate_and_list(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    created = create(contract)
    assert created["status"] == "PENDING"
    mock_analysis(direct_vm)
    result = contract.evaluate_check(CHECK)
    assert result["status"] == "BREAKING"
    assert result["analysis"]["affected"] is True
    wallet = "0x" + direct_alice.hex()
    page = contract.list_checks(wallet, 0, 20)
    assert page["total"] == 1
    assert page["items"][0]["id"] == CHECK


def test_rejects_invalid_or_duplicate_records(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    create(contract)
    with direct_vm.expect_revert("already exists"):
        create(contract)
    with direct_vm.expect_revert("must differ"):
        contract.create_check("b" * 32, "lib", "1", "1", USAGE, RELEASE, MIGRATION)
    with direct_vm.expect_revert("must be different"):
        contract.create_check("c" * 32, "lib", "1", "2", USAGE, RELEASE, RELEASE)


def test_only_owner_can_evaluate(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    create(contract)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the check owner"):
        contract.evaluate_check(CHECK)


def test_unavailable_sources_can_be_retried(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    create(contract)
    direct_vm.clear_mocks()
    first = contract.evaluate_check(CHECK)
    assert first["status"] == "UNVERIFIABLE"
    mock_analysis(direct_vm, "SAFE")
    second = contract.evaluate_check(CHECK)
    assert second["status"] == "SAFE"
    assert second["attempts"] == 2
