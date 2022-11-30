// ----------------------------------------------- //
// 읽어올 폴더 트리 구조 //
// 03-domain
// 04-tenantGroup
// 05-taxonomy
// 06-taxonomy-version
// 각각의 읽어올 내용 정리 //
// domain: id
// tenantGroup: id, domainId
// taxonomy: id, taxonomytenantGroupId
// taxonomyVersion: id, taxonomyId, previousVersionId, categories
// categories 내부: id, versionId, parentId
// parentId가 null이면 taxonomy가 상위, null이 아니면 해당 category가 상위
// ----------------------------------------------- //
// 자료 관리 구조 //
// ref_parser에 domain, tenantGroup, taxonomy, category Map 생성
// 모두 다음과 같은 key, value 구조를 같는다 : id, {parent: {id: class}, child: {id: class, }}
// 이 때, domain은 예외로 parent는 항상 null을 가지며 taxonomy는 version 항목을 갖는다
// }

const fs = require('fs');
const path = require('path');
const readline = require('readline');
// ------------------------------------------ 외부 동작 함수 ------------------------------------------ //
exports.ref_parser = function(refRootdir) {
    this.refRootdir = refRootdir + '/gitDB'; // ref 파일들이 저장된 최상위 폴더
    this.refItems = {};
    // typeName에 정의된 목록만큼 Map을 생성한다
    Object.values(typeName).forEach((type) => {
        this.refItems[type] = new Map();
    });
}

// 새로운 파일 입력
exports.ref_parser.prototype.addReferenceModel = function(ReferenceModel) {
    // ReferenceModel은 reference model 정보가 들은 배열이다
    // 우선, 분류를 한 뒤 정렬한다
    const sorted_list = sortFileList(this, ReferenceModel);
    // 배열된 결과는 sorted dict {domain: [], tenantGroup: [], taxonomy: [], taxonomyVersion: []} 의 형태로 저장되어 나온다
    // 각각의 배열에 대해 iterate를 해준다
    sorted_list.domain.forEach((element) => { domainParser(this, element); });
    sorted_list.tenantGroup.forEach((element) => {
        const result = tenantGroupParser(this, element);
        if (result != errorType.NO_ERROR) {
            // tenantGroupParser에서 에러가 나왔다는 건 상위 domain이 미등록된 상태란 의미이다
        }
    })
    sorted_list.taxonomy.forEach((element) => {
        const result = taxonomyParser(this, element);
        if (result != errorType.NO_ERROR) {
            // taxonomyParser에서 에러가 나왔다는 건 상위 tenantGroup이 미등록된 상태란 의미이다
        }
    })
    sorted_list.taxonomyVersion.forEach((element) => {
        const result = taxonomyVersionParser(this, element);
        if (result != errorType.NO_ERROR) {
            // taxonomyVersionParser에서 에러가 나왔다는 건 버전이 맞지 않다는 의미이거나 상위 taxonomy가 미등록 상태이거나 category 구조에 문제가 있다는 의미이다
            if (result == errorType.VERSION_NOT_MATCHING) {
                // 버전이 맞지 않는 경우
            }
            // taxonomy가 미등록인 경우
            else if (result == errorType.NOT_REGISTERED) {
                // category 구조에 문제가 있는 경우
            }
        }
    })
}

// 입력된 위치까지의 폴더 경로 반환하는 함수
exports.ref_parser.prototype.search_related = function(id) {
    var related = [];
    var make_relate = function(id, type) {
        var relate = {"operation": "UPDATE", "id": id, "type": type};
        return relate
    }
    // id와 type 기반으로 등록 여부 확인
    var current = null;
    current = this.refItems[typeName.category].get(id);
    if (!current) return errorType.NOT_REGISTERED;
    // 위로 타고 들어가면서 폴더 경로 생성
    related.push(make_relate(id, typeName.category));
    while(current.parent != null) {
        // 검색
        var currentId = Object.keys(current.parent)[0];
        var currentType = current.parent[currentId];
        current = this.refItems[currentType].get(currentId);
        // 파일 경로에 추가
        related.push(make_relate(currentId, currentType));
    }
    return related;
}

// 이미 자료가 다 담긴 폴더의 주소를 주면 하위 폴더 정보 읽어들여서 스스로 테스트하는 함수
exports.ref_parser.prototype.test = function(folderPath) {
    // 반드시 folderPath는 03-domain, 04-tenantGroup, 05-taxonomy, 06-taxonomy-version을 갖고 있어야한다.
    const folder_list = [refFolder.domain, refFolder.tenantGroup, refFolder.taxonomy, refFolder.taxonomyVersion];
    var filePath_list = [];
    folder_list.forEach((element) => {
        var fileList = fs.readdirSync(folderPath+'/'+element).filter(filename => filename.includes(".json"));
        fileList.forEach((e) => filePath_list.push(element+'/'+e));
    })
    this.refRootdir = folderPath;
    // 만들어진 파일 목록으로 프로그램 테스트
    this.addReferenceModel(filePath_list);
    // 저장된 결과물 확인
}

// ------------------------------------------ 내부 동작 함수 ------------------------------------------ //
// 동기 방식 json 읽기
function readJsonToDict(filepath) {
    const jsonFile = fs.readFileSync(filepath, 'utf8');
    const dict = JSON.parse(jsonFile);
    return dict;
}

// 새로운 도메인 생성 시
function domainParser(parser, filepath) {
    const dict = readJsonToDict(filepath);
    // 읽어올 내용은 id 하나 뿐이다
    const domainId = dict.id;
    var new_domain = {parent: null, child: {}};
    // parser의 domain에 해당 내용 추가
    parser.refItems.domain.set(domainId, new_domain);
    // 폴더 생성하기
}

// tenantGroup, taxonomy, category 추가 시
function tenantGroupParser(parser, filepath) {
    const dict = readJsonToDict(filepath);
    // 읽어올 내용은 id, domainId 두개이다
    const tenantGroupId = dict.id;
    const domainId = dict.domainId;
    // domain이 존재하는지 확인
    var domain = parser.refItems.domain.get(domainId); // 없으면 undefined
    if (!domain) return errorType.NOT_REGISTERED;
    // 해당 도메인의 child에 tenantGroup 추가
    domain.child[tenantGroupId] = typeName.tenantGroup;
    // parser의 tenantGroup에 내용 추가
    var new_tenantGroup = {parent: {}, child: {}};
    new_tenantGroup.parent[domainId] = typeName.domain;
    parser.refItems.tenantGroup.set(tenantGroupId, new_tenantGroup);
    // 폴더 생성하기
    return errorType.NO_ERROR;
}

function taxonomyParser(parser, filepath) {
    const dict = readJsonToDict(filepath);
    // 읽어올 내용은 id, taxonomytenantGroupId이다
    const taxonomyId = dict.id;
    const tenantGroupId = dict.taxonomytenantGroupId;
    // tenantGroup이 존재하는지 확인
    var tenantGroup = parser.refItems.tenantGroup.get(tenantGroupId);
    if (!tenantGroup) return errorType.NOT_REGISTERED;
    // 해당 tenantGroup의 child에 taxonomy 추가
    tenantGroup.child[taxonomyId] = typeName.taxonomy;
    // parser의 taxonomy에 내용 추가
    var new_taxonomy = {parent: {}, child: {}, previousVersion: null};
    new_taxonomy.parent[tenantGroupId] = typeName.tenantGroup;
    parser.refItems.taxonomy.set(taxonomyId, new_taxonomy);
    // 폴더 생성하기
    return errorType.NO_ERROR;
}

function taxonomyVersionParser(parser, filepath) {
    const dict = readJsonToDict(filepath);
    // 읽어올 내용은 id,taxonomyId, previousVersionId, categories
    const current_versionId = dict.id;
    const previous_versionId = dict.previousVersionId;
    const taxonomyId = dict.taxonomyId;
    const categories = dict.categories;
    // Taxonomy 존재여부 확인
    var taxonomy = parser.refItems.taxonomy.get(taxonomyId);
    if (!taxonomy) return errorType.NOT_REGISTERED;
    // 버전 체크
    if (taxonomy.previousVersion != previous_versionId) return errorType.VERSION_NOT_MATCHING;
    // 버전이 일치한다면 버전을 갱신한 다음 category를 파싱한다
    taxonomy.previousVersion = current_versionId;
    // categories 읽어들이기
    while (categories.length > 0) {
        // 앞에서부터 하나씩
        var current = categories.shift();
        if (categoryParser(parser, taxonomyId, current) != errorType.NO_ERROR) {
            // 만약 에러가 발생한다면 일단 뒤로 보낸다
            categories.push(current);
        }
    }
    return errorType.NO_ERROR;
}

function categoryParser(parser, taxonomyId, category) {
    // 읽어들일 내용: id, parentId
    const categoryId = category.id;
    const parentId = category.parentId;
    // 우선 parent가 등록된 바 있는 지 확인
    if (parentId == null) {
        // taxonomy가 parent인 경우
        var taxonomy = parser.refItems.taxonomy.get(taxonomyId);
        // 해당 taxonomy의 child에 category 추가
        taxonomy.child[categoryId] = typeName.category;
        // parser의 category에 내용 추가
        var new_category = {parent: {}, child: {}};
        new_category.parent[taxonomyId] = typeName.taxonomy;
        parser.refItems.category.set(categoryId, new_category);
        // 폴더 생성하기
        return errorType.NO_ERROR;
    }
    else {
        // category가 parent인 경우
        var parent_category = parser.refItems.category.get(parentId);
        if (parent_category) {
            // 해당 category의 child에 category 추가
            parent_category.child[categoryId] = typeName.category;
            // parser의 category에 내용 추가
            var new_category = {parent: {}, child:{}};
            new_category.parent[parentId] = typeName.category;
            parser.refItems.category.set(categoryId, new_category);
            // 폴더 생성하기
            return errorType.NO_ERROR;
        }
        else {
            // 아직 부모 카테고리가 미등록 상태인 경우
            return errorType.NOT_REGISTERED;
        }
    }
}

// taxonomyVersion의 modified 시간 구하는 함수
function getModifiedTime(filepath) {
    const content = readJsonToDict(filepath);
    return new Date(content.modified);
}

// 입력된 파일 목록 Sorting
function sortFileList(parser, filepathList) {
    // 파일 목록을 보고 domain, tenantGroup, taxonomy, taxonomyVersion 별로 나눈다
    // 각각 분류 내에서 파일 수정 시간에 따라 순서를 정렬한다
    var sorted = {domain:[], tenantGroup:[], taxonomy:[], taxonomyVersion:[]};
    // 우선 분류
    filepathList.forEach((filepath) => {
        var fullDir = path.dirname(filepath);
        var upperDir = fullDir.split(path.sep).pop();
        switch (upperDir) {
            case refFolder.domain:
                sorted.domain.push(parser.refRootdir + '/' + filepath);
                break;
            case refFolder.tenantGroup:
                sorted.tenantGroup.push(parser.refRootdir + '/' + filepath);
                break;
            case refFolder.taxonomy:
                sorted.taxonomy.push(parser.refRootdir + '/' + filepath);
                break;
            case refFolder.taxonomyVersion:
                sorted.taxonomyVersion.push(parser.refRootdir + '/' + filepath);
                break;
            default:
                break;
        }
    });
    // 정렬
    // 정렬은 taxonomyVersion만 하면 된다
    if (sorted.taxonomyVersion.length > 2) {
        sorted.taxonomyVersion.sort(function(a,b) {
            return getModifiedTime(a) - getModifiedTime(b);
        });
    }
    return sorted;
}

// ------------------------------------------ ENUM ------------------------------------------ //
const errorType = Object.freeze({
    NOT_REGISTERED: Symbol('item is not registered yet'),
    VERSION_NOT_MATCHING: Symbol('version is not matching'),
    TYPE_NOT_MATCHING: Symbol('type and id is not matching'),
    NOT_CONTINUOUS: Symbol('input related is disconnected'),
    NO_ERROR: Symbol('no error')
});

const typeName = Object.freeze({
    domain: 'domain',
    tenantGroup: 'tenantGroup',
    taxonomy: 'taxonomy',
    category: 'category'
});

const refFolder = Object.freeze({
    domain: 'domain',
    tenantGroup: 'tenantGroup',
    taxonomy: 'taxonomy',
    taxonomyVersion: 'taxonomyVersion'
});


// 예시 related
// [{"operation": "UPDATE", "id": "domain01", "type": "domain"}, {"operation": "UPDATE", "id": "tenantGroup01", "type": "tenantGroup"}, {"operation": "UPDATE", "id": "taxonomy01", "type": "taxonomy"}, {"operation": "UPDATE", "id": "category0001", "type": "category"}, {"operation": "UPDATE", "id": "category00011", "type": "category"}]


// 틀린 예시 related
// [{"operation": "UPDATE", "id": "domain01", "type": "domain"}, {"operation": "UPDATE", "id": "taxonomy01", "type": "taxonomy"}, {"operation": "UPDATE", "id": "category0001", "type": "category"}, {"operation": "UPDATE", "id": "category00011", "type": "category"}]