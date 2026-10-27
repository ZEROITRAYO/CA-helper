import { Link, useLocation, useParams, useSearchParams } from "react-router";
import { useServices, useVerifiedCa, useVerifiedCas } from "@/api";
import { BackLink, caFacts, Field, Options, PageTitle, Pager, QueryStatus, RatingSummary, Row, Section, SpecializationBadges, Stars, Table, VerifiedBadge } from "@/components/shared";
import { Button, buttonClass, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select} from "@/components/ui";
import { CA_LANGUAGE_LABELS, CA_SPECIALIZATION_LABELS, formatDateTime, formatRupees, label, labelList, SERVICE_UNIT_LABELS } from "@/lib";


const FILTERS = ["service", "specialization", "language", "city"];
export function MarketplacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = {
    specialization: searchParams.get("specialization") ?? "",
    language: searchParams.get("language") ?? "",
    city: searchParams.get("city") ?? "",
    service: searchParams.get("service") ?? "",
    page: Number(searchParams.get("page") || 1),
  };


  const cas = useVerifiedCas(filters);
  const services = useServices();
  const chosenService = (services.data ?? []).find((service) => service.code === filters.service);


  function show(changes) {
    const next = { ...filters, page: 1, ...changes };
    const params = {};
    for (const name in next) {

      if (next[name] && !(name === "page" && next[name] === 1)){
        params[name] = next[name];
      } 
    }
    setSearchParams(params);
  }



  function onSearch(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    show(Object.fromEntries(FILTERS.map((name) => [name, form.get(name)])));
  }


  return (
    <div className="space-y-6">
      <PageTitle title="Find a CA">Every CA listed here has been verified by our team.</PageTitle>
      <form
        key={searchParams.toString() + (services.isSuccess ? " loaded" : "")}
        className="grid gap-3 sm:grid-cols-2 sm:items-end lg:grid-cols-5"
        onSubmit={onSearch}
      >
        <Field id="service" label="Service">
          <Select id="service" name="service" defaultValue={filters.service}>
            
            <option value="">Any</option>

            {(services.data ?? []).map((service) => (
              <option key={service.id} value={service.code}>
                {service.name}
              </option>
            ))}
            
          </Select>
        </Field>


        <Field id="specialization" label="Specialization">
          <Select id="specialization" name="specialization" defaultValue={filters.specialization}>
            <Options labels={CA_SPECIALIZATION_LABELS} empty="Any" />
          </Select>
        </Field>

        <Field id="language" label="Language">
          <Select id="language" name="language" defaultValue={filters.language}>
            <Options labels={CA_LANGUAGE_LABELS} empty="Any" />
          </Select>
        </Field>

        <Field id="city" label="City">
          <Input id="city" name="city" defaultValue={filters.city} placeholder="Any" />
        </Field>


        <div className="flex gap-2">
          <Button type="submit">Search</Button>
          <Button type="button" variant="outline" onClick={() => setSearchParams({})}>
            Clear
          </Button>
        </div>
      </form>


      <QueryStatus query={cas} />
      {cas.isSuccess && (
        <>
          <p className="text-sm text-hint">
            {cas.data.total === 1 ? "1 CA found" : `${cas.data.total} CAs found`}
          </p>

          {cas.data.items.length === 0 ? (
            <p className="text-sm">No verified CAs match these filters.</p>) : 
            (<ul className="grid gap-4 lg:grid-cols-2">

              {cas.data.items.map((ca) => (
                <li key={ca.id}>
                  <CaCard ca={ca} service={chosenService} search={searchParams.toString()} />
                </li>
              ))}


            </ul>
          )}

          
          <Pager data={cas.data} onPage={(page) => show({ ...filters, page })} />
        </>
      )}
    </div>
  );
}


function CaCard({ ca, service, search }) {
  return (
    <Link to={"/business/marketplace/" + ca.id} state={{ search }} className="block h-full">
      <Card className="h-full cursor-pointer transition hover:shadow-md hover:ring-2 hover:ring-primary/40">

        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <h2>{ca.full_name}</h2>
            <VerifiedBadge />

            {ca.rating_count > 0 && (
              <span className="text-sm font-normal">
                <RatingSummary average={ca.rating_average} count={ca.rating_count} />
              </span>
            )}

          </CardTitle>

          <CardDescription>{caFacts(ca)}</CardDescription>
        </CardHeader>


        <CardContent className="space-y-3 text-sm">
          <SpecializationBadges codes={ca.specializations} />
          <p>
            <span className="text-hint">Languages: </span>
            {labelList(CA_LANGUAGE_LABELS, ca.languages)}
          </p>

          {ca.about && <p>{ca.about}</p>}
          {service && ca.price !== null && (
            <p>
              <span className="text-hint">Fee for {service.name}: </span>
              <span className="font-medium">
                {formatRupees(ca.price) + " " + label(SERVICE_UNIT_LABELS, service.unit)}
              </span>
            </p>
          )}


        </CardContent>


      </Card>
    </Link>
  );
}


export function CaDetailPage() {
  const { caId } = useParams();
  const search = useLocation().state?.search;
  const ca = useVerifiedCa(caId);

  return (
    <div className="max-w-3xl space-y-6">
      <BackLink to={"/business/marketplace" + (search ? "?" + search : "")}>Back to results</BackLink>
      <QueryStatus query={ca} />
      {ca.isSuccess && <CaDetails ca={ca.data} />}
    </div>
  );
}



function CaDetails({ ca }) {
  return (
    <>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{ca.full_name}</h1>
          <VerifiedBadge />
        </div>
        <p className="text-sm text-hint">{caFacts(ca)}</p>
      </div>


      <Link to={"/business/marketplace/" + ca.id + "/request"} className={buttonClass()}>
        Request this CA
      </Link>

      <Section
        title="About"
        description={ca.about || "This CA has not written anything about their practice."}
        contentClassName="space-y-3 text-sm">


        <div className="space-y-1">
          <p className="font-medium">Specializations</p>
          <SpecializationBadges codes={ca.specializations} />
        </div>


        <p>
          <span className="font-medium">Languages: </span>
          {labelList(CA_LANGUAGE_LABELS, ca.languages)}
        </p>


      </Section>


      <Section title="Services & fees" description="The CA's fixed fee for each service.">
        {ca.services.length === 0 ? (
          <p className="text-sm">This CA has not listed any prices yet.</p>) : 
          (<Table headers={["Service", "Fee"]}>

            {ca.services.map((service) => (
              <Row
                key={service.id}
                cells={[
                  service.name,
                  <>
                    <span className="font-medium">{formatRupees(service.price)}</span>{" "}
                    {label(SERVICE_UNIT_LABELS, service.unit)}
                  </>,
                ]}
              />

            ))}

          </Table>
        )}
      </Section>



      <Section title="Ratings" description={<RatingSummary average={ca.rating_average} count={ca.rating_count} />}>

        {ca.reviews?.length > 0 && (
          <ul className="space-y-3 text-sm">

            {ca.reviews.map((review) => (
              <li key={review.created_at}>
                <Stars stars={review.stars} />{" "}
                <span className="text-hint">{formatDateTime(review.created_at)}</span>
                {review.review && <p>{review.review}</p>}
              </li>
            ))}

            
          </ul>
        )}


      </Section>
    </>
  );
}